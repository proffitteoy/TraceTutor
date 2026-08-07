import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  assetQueryTools,
  learningActionSchema,
  learningCardSchema,
  learningResponseSchema,
  queryPlanSchema,
  stateDeltaSchema,
  stateQueryTools,
  toolResultSchema,
  type LearningRequest,
  type LearningResponse,
  type QueryPlan,
  type ToolName,
  type ToolResult
} from "../contracts.js"
import { AppError } from "../errors.js"
import type {
  RequestContext,
  ToolExecutionPort
} from "../ports.js"
import type { QuestionIngestionService } from "../ingestion/question-ingestion.js"
import { toolInputSchemas } from "../tool-schemas.js"
import type { LocalModel, ModelHealth } from "./local-model.js"
import {
  GLOBAL_POLICY,
  INTENT_PLANNER_POLICY,
  TEACHING_COMPOSER_POLICY
} from "./prompts.js"

const teachingOutputSchema = z
  .object({
    summary: z.string().min(1).max(2_000),
    cards: z.array(learningCardSchema).min(1).max(10),
    actions: z.array(learningActionSchema).max(5)
  })
  .strict()

const gradingSchema = z
  .object({
    judgement: z.enum(["correct", "incorrect", "partial", "ungraded"]),
    feedback: z.string().min(1).max(2_000),
    knowledge_point_ids: z.array(z.string().min(1)).max(20),
    method_ids: z.array(z.string().min(1)).max(20)
  })
  .strict()

const pendingStateDeltaCandidateSchema = z
  .object({
    pending_state_delta_id: z.string().min(1).max(128),
    state_delta: stateDeltaSchema
  })
  .strict()

const questionCreateSchema = z
  .object({
    stem: z.string().min(1).max(20_000),
    answer: z.string().min(1).max(20_000),
    analysis: z.string().min(1).max(40_000),
    proposed_knowledge_point_ids: z.array(z.string().min(1)).max(20),
    proposed_method_ids: z.array(z.string().min(1)).max(20)
  })
  .strict()

interface ToolObservation {
  tool: ToolName
  status: "ok" | "empty" | "unavailable" | "failed" | "skipped"
  reason: string
  result?: ToolResult
}

interface PlannedCall {
  tool: ToolName
  input: Record<string, unknown>
}

function pick(
  source: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter(key => source[key] !== undefined)
      .map(key => [key, source[key]])
  )
}

function materializePlan(
  request: LearningRequest,
  plan: QueryPlan
): PlannedCall[] {
  const context = {
    user_id: request.user_id,
    session_id: request.session_id
  }
  const calls: PlannedCall[] = []

  for (const query of plan.state_queries) {
    const input =
      query.tool === "state.query_user_snapshot"
        ? context
        : query.tool === "state.query_wrong_questions"
          ? {
              ...context,
              ...pick(query.filters, [
                "knowledge_area",
                "knowledge_point_ids",
                "state_labels",
                "recent_only"
              ]),
              ...(query.limit ? { limit: query.limit } : {})
            }
          : {
              ...context,
              ...pick(query.filters, ["due_before", "target_types"]),
              ...(query.limit ? { limit: query.limit } : {})
            }

    calls.push({ tool: query.tool, input })
  }

  for (const query of plan.asset_queries) {
    const base = {
      ...context,
      ...pick(query.filters, [
        "question_id",
        "knowledge_point_ids",
        "knowledge_area",
        "method_ids",
        "exclude_question_ids",
        "exclude_method_ids",
        "exclude_knowledge_point_ids",
        "similarity_dimensions",
        "only_active"
      ]),
      ...(query.base_question_id
        ? { base_question_id: query.base_question_id }
        : {}),
      ...(query.difficulty_policy
        ? { difficulty_policy: query.difficulty_policy }
        : {}),
      ...(query.limit ? { limit: query.limit } : {})
    }

    const input =
      query.tool === "asset.get_question_detail" ||
      query.tool === "asset.get_solution_steps"
        ? {
            ...context,
            question_id:
              query.base_question_id ??
              query.filters.question_id ??
              request.active_question_id,
            only_active: true
          }
        : base

    calls.push({ tool: query.tool, input })
  }

  return calls
}

function collectReferencedIds(value: unknown, target: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach(item => collectReferencedIds(item, target))
    return
  }
  if (value === null || typeof value !== "object") return

  for (const [key, child] of Object.entries(value)) {
    if (
      key === "question_id" &&
      typeof child === "string" &&
      child.length > 0
    ) {
      target.add(child)
    } else if (key === "question_ids" && Array.isArray(child)) {
      child.forEach(id => {
        if (typeof id === "string") target.add(id)
      })
    }
    collectReferencedIds(child, target)
  }
}

interface KnownTagIds {
  knowledgePointIds: Set<string>
  methodIds: Set<string>
}

function collectTagIds(value: unknown, target: KnownTagIds): void {
  if (Array.isArray(value)) {
    value.forEach(item => collectTagIds(item, target))
    return
  }
  if (value === null || typeof value !== "object") return

  for (const [key, child] of Object.entries(value)) {
    if (key === "knowledge_point_id" && typeof child === "string") {
      target.knowledgePointIds.add(child)
    } else if (key === "method_id" && typeof child === "string") {
      target.methodIds.add(child)
    } else if (key === "knowledge_point_ids" && Array.isArray(child)) {
      child.forEach(id => {
        if (typeof id === "string") target.knowledgePointIds.add(id)
      })
    } else if (key === "method_ids" && Array.isArray(child)) {
      child.forEach(id => {
        if (typeof id === "string") target.methodIds.add(id)
      })
    } else if (
      (key === "knowledge_points" || key === "methods") &&
      Array.isArray(child)
    ) {
      const ids =
        key === "knowledge_points"
          ? target.knowledgePointIds
          : target.methodIds
      child.forEach(item => {
        if (
          item !== null &&
          typeof item === "object" &&
          "id" in item &&
          typeof item.id === "string"
        ) {
          ids.add(item.id)
        }
      })
    }
    collectTagIds(child, target)
  }
}

function collectScheduleIds(value: unknown, target: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach(item => collectScheduleIds(item, target))
    return
  }
  if (value === null || typeof value !== "object") return

  for (const [key, child] of Object.entries(value)) {
    if (key === "schedule_id" && typeof child === "string") {
      target.add(child)
    } else if (key === "schedule_ids" && Array.isArray(child)) {
      child.forEach(id => {
        if (typeof id === "string") target.add(id)
      })
    }
    collectScheduleIds(child, target)
  }
}

function ensureKnownQuestionReferences(
  output: z.infer<typeof teachingOutputSchema>,
  request: LearningRequest,
  observations: ToolObservation[]
): void {
  const known = new Set<string>()
  if (request.active_question_id) known.add(request.active_question_id)
  observations.forEach(observation =>
    collectReferencedIds(observation.result, known)
  )

  const referenced = [
    ...output.cards.flatMap(card =>
      "question_id" in card ? [card.question_id] : []
    ),
    ...output.actions.flatMap(action =>
      action.question_id ? [action.question_id] : []
    )
  ]
  const unknown = referenced.filter(id => !known.has(id))
  if (unknown.length > 0) {
    throw new AppError(
      "MODEL_OUTPUT_INVALID",
      "本地模型引用了工具未返回的题目 ID",
      502,
      { unknown_question_ids: [...new Set(unknown)] }
    )
  }

  const knownSchedules = new Set<string>()
  observations.forEach(observation =>
    collectScheduleIds(observation.result, knownSchedules)
  )
  const unknownSchedules = output.actions
    .flatMap(action => (action.schedule_id ? [action.schedule_id] : []))
    .filter(id => !knownSchedules.has(id))
  if (unknownSchedules.length > 0) {
    throw new AppError(
      "MODEL_OUTPUT_INVALID",
      "本地模型引用了工具未返回的复习计划 ID",
      502,
      { unknown_schedule_ids: [...new Set(unknownSchedules)] }
    )
  }
}

function ensureStateClaims(
  output: z.infer<typeof teachingOutputSchema>,
  observations: ToolObservation[]
): void {
  const hasAppliedDelta = observations.some(
    item => item.tool === "state.apply_state_delta" && item.status === "ok"
  )
  const hasStateWrite = observations.some(
    item =>
      (item.tool === "state.write_attempt_result" ||
        item.tool === "state.write_review_result" ||
        item.tool === "state.apply_state_delta") &&
      item.status === "ok"
  )

  output.cards = output.cards.filter(card => {
    if (card.type !== "state_change") return true
    if (card.status === "applied" && !hasAppliedDelta) return false
    if (card.status === "pending" && !hasStateWrite) return false
    return true
  })
}

function compactObservations(observations: ToolObservation[]): string {
  const compact = observations.map(observation => ({
    tool: observation.tool,
    status: observation.status,
    reason: observation.reason,
    ...(observation.result
      ? {
          result: {
            ...observation.result,
            items: observation.result.items?.slice(0, 5)
          }
        }
      : {})
  }))
  return JSON.stringify(compact).slice(0, 20_000)
}

export class LocalAgentRuntime {
  constructor(
    private readonly model: LocalModel,
    private readonly toolExecution?: ToolExecutionPort,
    private readonly questionIngestion?: QuestionIngestionService
  ) {}

  modelHealth(): Promise<ModelHealth> {
    return this.model.health()
  }

  private async executeCalls(
    calls: PlannedCall[],
    context: RequestContext
  ): Promise<ToolObservation[]> {
    const observations: ToolObservation[] = []

    for (const call of calls) {
      const parsed = toolInputSchemas[call.tool].safeParse(call.input)
      if (!parsed.success) {
        observations.push({
          tool: call.tool,
          status: "skipped",
          reason: "查询计划缺少该工具所需参数"
        })
        continue
      }

      if (
        this.toolExecution === undefined ||
        !this.toolExecution.capabilities.has(call.tool)
      ) {
        observations.push({
          tool: call.tool,
          status: "unavailable",
          reason: "数据库业务工具端口尚未接入"
        })
        continue
      }

      try {
        const rawResult = await this.toolExecution.execute(
          call.tool,
          parsed.data,
          context
        )
        const result = toolResultSchema.parse(rawResult)
        observations.push({
          tool: call.tool,
          status: result.meta.status === "empty" ? "empty" : "ok",
          reason: result.meta.reason,
          result
        })
      } catch (error) {
        observations.push({
          tool: call.tool,
          status: "failed",
          reason: error instanceof Error ? error.message : "工具执行失败"
        })
      }
    }

    return observations
  }

  private async plan(request: LearningRequest): Promise<QueryPlan> {
    const plan = await this.model.generateJson({
      name: "query_plan",
      system: INTENT_PLANNER_POLICY,
      prompt: `白名单 state_queries：${stateQueryTools.join(", ")}
白名单 asset_queries：${assetQueryTools.join(", ")}
LearningRequest：
${JSON.stringify(request)}
只输出 QueryPlan。`,
      schema: queryPlanSchema,
      temperature: 0
    })

    return plan
  }

  private async gradeSubmission(
    request: LearningRequest,
    observations: ToolObservation[]
  ): Promise<z.infer<typeof gradingSchema> | null> {
    if (
      request.action?.type !== "submit_answer" ||
      request.active_question_id === null
    ) {
      return null
    }

    const hasQuestionEvidence = observations.some(
      item =>
        (item.tool === "asset.get_question_detail" ||
          item.tool === "asset.get_solution_steps") &&
        item.status === "ok"
    )
    if (!hasQuestionEvidence) return null

    const grade = await this.model.generateJson({
      name: "answer_grading",
      system: GLOBAL_POLICY,
      prompt: `根据已审核题目与解题步骤判定用户作答。只引用工具结果里已有的知识点和方法 ID。
用户答案：${request.user_text}
工具结果：${compactObservations(observations)}`,
      schema: gradingSchema,
      temperature: 0
    })

    const knownIds: KnownTagIds = {
      knowledgePointIds: new Set<string>(),
      methodIds: new Set<string>()
    }
    observations.forEach(item => collectTagIds(item.result, knownIds))
    return {
      ...grade,
      knowledge_point_ids: grade.knowledge_point_ids.filter(id =>
        knownIds.knowledgePointIds.has(id)
      ),
      method_ids: grade.method_ids.filter(id => knownIds.methodIds.has(id))
    }
  }

  private async createVariantQuestion(
    request: LearningRequest,
    observations: ToolObservation[],
    context: RequestContext
  ): Promise<ToolObservation | null> {
    if (
      request.action?.type !== "generate_variant" ||
      request.active_question_id === null
    ) {
      return null
    }

    const hasQuestionEvidence = observations.some(
      item =>
        item.tool === "asset.get_question_detail" && item.status === "ok"
    )
    if (!hasQuestionEvidence) {
      return {
        tool: "asset.create_question",
        status: "skipped",
        reason: "没有取得 active question 详情，不能生成可追溯变式题"
      }
    }

    const generated = await this.model.generateJson({
      name: "variant_question",
      system: GLOBAL_POLICY,
      prompt: `基于已审核题目生成一道结构有变化、但教学目标清晰的变式题。
只引用工具结果中已有的知识点与方法 ID。
工具结果：${compactObservations(observations)}`,
      schema: questionCreateSchema,
      temperature: 0.35
    })

    const knownTagIds: KnownTagIds = {
      knowledgePointIds: new Set<string>(),
      methodIds: new Set<string>()
    }
    observations
      .filter(item => item.tool === "asset.get_question_detail")
      .forEach(item => collectTagIds(item.result, knownTagIds))
    const proposedKnowledgePointIds =
      generated.proposed_knowledge_point_ids.filter(id =>
        knownTagIds.knowledgePointIds.has(id)
      )
    const proposedMethodIds = generated.proposed_method_ids.filter(id =>
      knownTagIds.methodIds.has(id)
    )
    const tool = "asset.create_question" as const
    const input = toolInputSchemas[tool].parse({
      user_id: request.user_id,
      session_id: request.session_id,
      stem: generated.stem,
      answer: generated.answer,
      analysis: generated.analysis,
      source_type: "ai_generated",
      source_reference: request.active_question_id,
      proposed_knowledge_point_ids:
        proposedKnowledgePointIds.length > 0
          ? proposedKnowledgePointIds
          : [...knownTagIds.knowledgePointIds].slice(0, 1),
      proposed_method_ids:
        proposedMethodIds.length > 0
          ? proposedMethodIds
          : [...knownTagIds.methodIds].slice(0, 1)
    })

    if (
      this.toolExecution === undefined ||
      !this.toolExecution.capabilities.has(tool)
    ) {
      return {
        tool,
        status: "unavailable",
        reason: "变式题已生成，但 PgSQL 题目创建工具尚未接入，因此不返回伪造 ID"
      }
    }

    try {
      const result = toolResultSchema.parse(
        await this.toolExecution.execute(tool, input, context)
      )
      return {
        tool,
        status: result.meta.status === "empty" ? "empty" : "ok",
        reason: result.meta.reason,
        result
      }
    } catch (error) {
      return {
        tool,
        status: "failed",
        reason: error instanceof Error ? error.message : "变式题创建失败"
      }
    }
  }

  private async writeAttempt(
    request: LearningRequest,
    grade: z.infer<typeof gradingSchema>,
    context: RequestContext
  ): Promise<ToolObservation> {
    const tool = "state.write_attempt_result" as const
    if (
      request.active_question_id === null ||
      request.action?.type !== "submit_answer"
    ) {
      return { tool, status: "skipped", reason: "当前请求不是有效作答提交" }
    }

    const input = toolInputSchemas[tool].parse({
      user_id: request.user_id,
      session_id: request.session_id,
      question_id: request.active_question_id,
      answer_text: request.user_text,
      judgement: grade.judgement,
      knowledge_point_ids: grade.knowledge_point_ids,
      method_ids: grade.method_ids,
      client_event_id: request.action.client_event_id
    })

    if (
      this.toolExecution === undefined ||
      !this.toolExecution.capabilities.has(tool)
    ) {
      return {
        tool,
        status: "unavailable",
        reason: "作答已判定，但 SQLite 工具端口尚未接入，未保存状态"
      }
    }

    try {
      const result = toolResultSchema.parse(
        await this.toolExecution.execute(tool, input, context)
      )
      return {
        tool,
        status: result.meta.status === "empty" ? "empty" : "ok",
        reason: result.meta.reason,
        result
      }
    } catch (error) {
      return {
        tool,
        status: "failed",
        reason: error instanceof Error ? error.message : "作答写入失败"
      }
    }
  }

  private async applyPendingStateDeltas(
    request: LearningRequest,
    writeObservation: ToolObservation,
    context: RequestContext
  ): Promise<ToolObservation[]> {
    const tool = "state.apply_state_delta" as const
    const candidates = writeObservation.result?.result?.pending_state_deltas
    if (!Array.isArray(candidates)) return []

    const observations: ToolObservation[] = []
    for (const [index, candidate] of candidates.entries()) {
      const parsedCandidate =
        pendingStateDeltaCandidateSchema.safeParse(candidate)
      if (!parsedCandidate.success) {
        observations.push({
          tool,
          status: "skipped",
          reason: "数据库返回的 pending_state_delta 不符合证据契约"
        })
        continue
      }

      if (
        this.toolExecution === undefined ||
        !this.toolExecution.capabilities.has(tool)
      ) {
        observations.push({
          tool,
          status: "unavailable",
          reason: "状态建议已进入 pending，但正式应用工具尚未接入"
        })
        continue
      }

      const input = toolInputSchemas[tool].parse({
        user_id: request.user_id,
        session_id: request.session_id,
        pending_state_delta_id:
          parsedCandidate.data.pending_state_delta_id,
        state_delta: parsedCandidate.data.state_delta,
        client_event_id: `${request.action?.client_event_id ?? context.requestId}:${index}`
      })

      try {
        const result = toolResultSchema.parse(
          await this.toolExecution.execute(tool, input, context)
        )
        observations.push({
          tool,
          status: result.meta.status === "empty" ? "empty" : "ok",
          reason: result.meta.reason,
          result
        })
      } catch (error) {
        observations.push({
          tool,
          status: "failed",
          reason: error instanceof Error ? error.message : "状态应用失败"
        })
      }
    }
    return observations
  }

  private async writeReviewResult(
    request: LearningRequest,
    grade: z.infer<typeof gradingSchema>,
    writeAttemptObservation: ToolObservation,
    context: RequestContext
  ): Promise<ToolObservation | null> {
    const scheduleId = request.action?.schedule_id
    const attemptId = writeAttemptObservation.result?.result?.attempt_id
    if (
      request.action?.type !== "submit_answer" ||
      !scheduleId ||
      typeof attemptId !== "string" ||
      request.active_question_id === null
    ) {
      return null
    }

    const tool = "state.write_review_result" as const
    if (
      this.toolExecution === undefined ||
      !this.toolExecution.capabilities.has(tool)
    ) {
      return {
        tool,
        status: "unavailable",
        reason: "作答事实已处理，但复习结果写入工具尚未接入"
      }
    }

    const outcome =
      grade.judgement === "correct"
        ? "remembered"
        : grade.judgement === "incorrect"
          ? "forgotten"
          : "partial"
    const input = toolInputSchemas[tool].parse({
      user_id: request.user_id,
      session_id: request.session_id,
      schedule_id: scheduleId,
      question_id: request.active_question_id,
      attempt_id: attemptId,
      outcome,
      client_event_id: `${request.action.client_event_id}:review`
    })

    try {
      const result = toolResultSchema.parse(
        await this.toolExecution.execute(tool, input, context)
      )
      return {
        tool,
        status: result.meta.status === "empty" ? "empty" : "ok",
        reason: result.meta.reason,
        result
      }
    } catch (error) {
      return {
        tool,
        status: "failed",
        reason: error instanceof Error ? error.message : "复习结果写入失败"
      }
    }
  }

  async run(
    request: LearningRequest,
    context: Pick<RequestContext, "requestId">
  ): Promise<LearningResponse> {
    const workflowRunId = randomUUID()
    const fullContext: RequestContext = {
      requestId: context.requestId,
      userId: request.user_id,
      sessionId: request.session_id
    }

    const plan = await this.plan(request)
    const calls = materializePlan(request, plan)
    const observations = await this.executeCalls(calls, fullContext)
    const variantObservation = await this.createVariantQuestion(
      request,
      observations,
      fullContext
    )
    if (variantObservation) observations.push(variantObservation)
    const grade = await this.gradeSubmission(request, observations)
    if (grade) {
      const writeObservation = await this.writeAttempt(
        request,
        grade,
        fullContext
      )
      observations.push(writeObservation)
      const reviewObservation = await this.writeReviewResult(
        request,
        grade,
        writeObservation,
        fullContext
      )
      if (reviewObservation) observations.push(reviewObservation)
      observations.push(
        ...(await this.applyPendingStateDeltas(
          request,
          writeObservation,
          fullContext
        ))
      )
      if (reviewObservation) {
        observations.push(
          ...(await this.applyPendingStateDeltas(
            request,
            reviewObservation,
            fullContext
          ))
        )
      }
    }

    const output = await this.model.generateJson({
      name: "teaching_output",
      system: TEACHING_COMPOSER_POLICY,
      prompt: `请根据请求、已校验查询计划和工具结果组织教学输出。
输入模式：${request.input_mode}
动作：${request.action?.type ?? "none"}
用户输入：${request.user_text}
QueryPlan：${JSON.stringify(plan)}
工具结果：${compactObservations(observations)}
${grade ? `作答判定：${JSON.stringify(grade)}` : ""}
工具 unavailable/failed 时，仅在影响用户请求的核心功能时才在内容中说明降级。对于非当前请求必需的工具（如用户未提交答案时的状态写入工具），不要在内容中提及。不要输出 meta、mode 或 pending_state_write。`,
      schema: teachingOutputSchema,
      temperature: request.action?.type === "request_hint" ? 0 : 0.2
    })

    ensureKnownQuestionReferences(output, request, observations)
    ensureStateClaims(output, observations)

    let questionDeposit:
      | {
          status: "active_created" | "duplicate" | "failed"
          reason: string
          question_id?: string
          review_item_id?: string
        }
      | undefined
    if (
      this.questionIngestion &&
      request.active_question_id === null &&
      (request.input_mode === "new_question" || request.input_mode === "free_chat") &&
      request.action === undefined
    ) {
      console.log(`[QuestionDeposit] Attempting to deposit user question for session ${request.session_id}, input_mode=${request.input_mode}`)
      try {
        const report = await this.questionIngestion.depositUserQuestion({
          userId: request.user_id,
          sessionId: request.session_id,
          requestId: context.requestId,
          workflowRunId,
          userText: request.user_text,
          teachingOutput: output
        })
        console.log(`[QuestionDeposit] Success: status=${report.status}, questionId=${report.questionId}`)
        questionDeposit = {
          status: report.status,
          reason: report.reason,
          ...(report.questionId ? { question_id: report.questionId } : {}),
          ...(report.reviewItemId
            ? { review_item_id: report.reviewItemId }
            : {})
        }
      } catch (error) {
        console.error(`[QuestionDeposit] Failed:`, error)
        questionDeposit = {
          status: "failed",
          reason:
            error instanceof Error
              ? `题目沉淀失败：${error.message}`
              : "题目沉淀失败"
        }
      }
    } else {
      console.log(`[QuestionDeposit] Skipped: questionIngestion=${!!this.questionIngestion}, active_question_id=${request.active_question_id}, input_mode=${request.input_mode}, has_action=${!!request.action}`)
    }

    const writeObservation = observations.find(
      item => item.tool === "state.write_attempt_result"
    )
    const applyObservations = observations.filter(
      item => item.tool === "state.apply_state_delta"
    )
    const hasPendingCandidates = Array.isArray(
      writeObservation?.result?.result?.pending_state_deltas
    )
    const pendingStateWrite =
      writeObservation?.status === "ok" &&
      hasPendingCandidates &&
      applyObservations.some(item => item.status !== "ok")

    const response: LearningResponse = {
      render_type: "learning_response",
      mode:
        plan.intent === "REVIEW_AND_VARIANT"
          ? "review_and_variant"
          : request.input_mode,
      summary: output.summary,
      cards: output.cards,
      actions: output.actions,
      pending_state_write: pendingStateWrite,
      meta: {
        source: "local_agent",
        request_id: context.requestId,
        workflow_run_id: workflowRunId,
        ...(questionDeposit ? { question_deposit: questionDeposit } : {})
      }
    }

    return learningResponseSchema.parse(response)
  }
}
