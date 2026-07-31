import type { LocalModel } from "../agent/local-model.js"
import type {
  QuestionIngestionPort,
  RequestContext
} from "../ports.js"
import {
  aiTagProposalSchema,
  canonicalQuestionHash,
  importChunkRequestSchema,
  questionJsonlSchema,
  reviewDecisionSchema,
  tagDictionarySchema,
  userQuestionNormalizationSchema,
  type AiTagProposal,
  type ImportChunkRequest,
  type ImportChunkSummary,
  type PersistableQuestion,
  type QuestionDepositReport,
  type QuestionJsonl,
  type ResolvedLabel,
  type ReviewDecision,
  type TagDictionary,
  type UserQuestionNormalization
} from "./contracts.js"

const TAGGING_POLICY = `你是 TraceTutor 题库标注器。知识点表示“学什么”，方法表示“怎么做”。
只能使用候选字典中存在的 code，不得发明 code 或 UUID。AI 标签只是待人工复核的提议，
置信度不得写成 1。保留 Markdown + LaTeX，不改变题目、答案或解析的数学含义。`

const USER_QUESTION_POLICY = `你是 TraceTutor 用户题目沉淀处理器。把用户明确提交的新题整理成可复核的题目资产。
输出必须含一个主答案、一个主解析和可执行步骤。知识点表示“学什么”，方法表示“怎么做”。
标签只能使用候选字典中存在的 code，不得发明 code 或 UUID。AI 标签置信度不得写成 1。
题目只能进入 draft，绝不能声称已经审核或 active。中文数学表达使用 Markdown + LaTeX。`

function compactDictionary(dictionary: TagDictionary): string {
  return JSON.stringify({
    knowledge_points: dictionary.knowledge_points.map(item => ({
      code: item.code,
      name: item.name,
      subject_code: item.subject_code
    })),
    methods: dictionary.methods.map(item => ({
      code: item.code,
      name: item.name
    }))
  }).slice(0, 30_000)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function resolveLabels(
  provided: ReadonlyArray<{
    code: string
    role: string
    confidence: number
  }>,
  proposed: ReadonlyArray<{
    code: string
    role: string
    confidence: number
  }>,
  dictionary: ReadonlyArray<{ id: string; code: string }>
): { resolved: ResolvedLabel[]; unresolved: string[] } {
  const byCode = new Map(dictionary.map(item => [item.code, item.id]))
  const resolved = new Map<string, ResolvedLabel>()
  const unresolved: string[] = []

  for (const [source, labels] of [
    ["provided", provided],
    ["ai", proposed]
  ] as const) {
    for (const label of labels) {
      const id = byCode.get(label.code)
      if (!id) {
        unresolved.push(label.code)
        continue
      }
      const key = `${label.code}:${label.role}`
      if (resolved.has(key)) continue
      resolved.set(key, {
        id,
        code: label.code,
        role: label.role,
        confidence:
          source === "ai" ? Math.min(label.confidence, 0.99) : label.confidence,
        source
      })
    }
  }

  return {
    resolved: [...resolved.values()],
    unresolved: unique(unresolved)
  }
}

function importedQuestionToPersistable(
  question: QuestionJsonl,
  tagging: AiTagProposal,
  dictionary: TagDictionary
): PersistableQuestion {
  const knowledge = resolveLabels(
    question.knowledge_points,
    tagging.knowledge_points,
    dictionary.knowledge_points
  )
  const methods = resolveLabels(
    question.methods,
    tagging.methods,
    dictionary.methods
  )

  return {
    schemaVersion: "1.0",
    externalId: question.external_id,
    source: question.source,
    subject: question.subject,
    title: question.title,
    stem: question.stem,
    questionType: question.question_type,
    difficultyLevel: question.difficulty_level,
    answers: question.answers,
    solutions: question.solutions,
    knowledgePoints: knowledge.resolved,
    methods: methods.resolved,
    unresolvedKnowledgeCodes: knowledge.unresolved,
    unresolvedMethodCodes: methods.unresolved,
    canonicalHash: canonicalQuestionHash(question.stem),
    status: "imported",
    metadata: {
      ...question.metadata,
      ai_estimated_time_minutes: tagging.estimated_time_minutes,
      ai_structure_codes: tagging.structure_codes,
      formula_warnings: tagging.formula_warnings
    },
    reviewNotes: tagging.review_notes
  }
}

function userQuestionToPersistable(
  normalized: UserQuestionNormalization,
  dictionary: TagDictionary,
  input: UserQuestionDepositInput
): PersistableQuestion {
  const knowledge = resolveLabels(
    [],
    normalized.knowledge_points,
    dictionary.knowledge_points
  )
  const methods = resolveLabels([], normalized.methods, dictionary.methods)

  return {
    schemaVersion: "1.0",
    externalId: `user-request:${input.requestId}`,
    source: {
      type: "user_submitted",
      title: "TraceTutor 用户提问",
      reference: `session:${input.sessionId};workflow:${input.workflowRunId}`
    },
    subject: normalized.subject,
    title: normalized.title,
    stem: normalized.stem,
    questionType: normalized.question_type,
    difficultyLevel: normalized.difficulty_level,
    answers: normalized.answers,
    solutions: normalized.solutions,
    knowledgePoints: knowledge.resolved,
    methods: methods.resolved,
    unresolvedKnowledgeCodes: knowledge.unresolved,
    unresolvedMethodCodes: methods.unresolved,
    canonicalHash: canonicalQuestionHash(normalized.stem),
    status: "draft",
    metadata: {
      language: "zh",
      estimated_time_minutes: normalized.estimated_time_minutes,
      structure_codes: normalized.structure_codes,
      source_user_id: input.userId,
      source_session_id: input.sessionId,
      source_workflow_run_id: input.workflowRunId
    },
    reviewNotes: normalized.review_notes
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 4_000)
  return "未知题目摄取错误"
}

export interface UserQuestionDepositInput {
  userId: string
  sessionId: string
  requestId: string
  workflowRunId: string
  userText: string
  teachingOutput: unknown
}

export class QuestionIngestionService {
  constructor(
    private readonly model: LocalModel,
    private readonly port: QuestionIngestionPort
  ) {}

  health() {
    return this.port.health?.() ?? Promise.resolve({
      ready: true,
      detail: "题目摄取端口已装配"
    })
  }

  private async tagImportedQuestion(
    question: QuestionJsonl,
    dictionary: TagDictionary
  ): Promise<AiTagProposal> {
    return this.model.generateJson({
      name: "question_import_tagging",
      system: TAGGING_POLICY,
      prompt: `候选标签字典：
${compactDictionary(dictionary)}

待标注题目：
${JSON.stringify(question)}

保留维护者提供的标签；只输出补充或校正建议以及人工复核提示。`,
      schema: aiTagProposalSchema,
      temperature: 0
    })
  }

  async importChunk(
    rawInput: ImportChunkRequest,
    context: Pick<RequestContext, "requestId">
  ): Promise<ImportChunkSummary> {
    const input = importChunkRequestSchema.parse(rawInput)
    const batch = await this.port.beginImportBatch({
      batchKey: input.batch_key,
      batchName: input.batch_name,
      sourceType: input.source_type,
      ...(input.source_uri ? { sourceUri: input.source_uri } : {})
    })
    const summary: ImportChunkSummary = {
      batchId: batch.batchId,
      received: input.items.length,
      imported: 0,
      duplicates: 0,
      failed: 0,
      finalChunk: input.final_chunk
    }

    for (const item of input.items) {
      try {
        const decoded =
          item.raw_json === undefined
            ? (JSON.parse(item.raw_text) as unknown)
            : item.raw_json
        const question = questionJsonlSchema.parse(decoded)
        const dictionary = tagDictionarySchema.parse(
          await this.port.loadTaggingContext({
            subjectCode: question.subject.code,
            stem: question.stem,
            proposedKnowledgeCodes: question.knowledge_points.map(
              label => label.code
            ),
            proposedMethodCodes: question.methods.map(label => label.code)
          })
        )
        const tagging =
          input.approval_mode === "activate"
            ? {
                knowledge_points: [],
                methods: [],
                estimated_time_minutes:
                  question.metadata.estimated_time_minutes ?? 1,
                structure_codes: question.metadata.structure_codes,
                formula_warnings: [],
                review_notes: ["已由批准 manifest 授权直接激活"]
              }
            : await this.tagImportedQuestion(question, dictionary)
        const writeResult = await this.port.recordImportItem({
          batchId: batch.batchId,
          lineNumber: item.line_number,
          rawText: item.raw_text,
          ...(item.raw_json === undefined ? {} : { rawJson: item.raw_json }),
          outcome: "imported",
          question: importedQuestionToPersistable(
            question,
            tagging,
            dictionary
          ),
          requestId: context.requestId
          ,...(input.approval_mode === "activate"
            ? {
                activateApproved: true,
                approvalSource: input.approval_source ?? "explicit_user_approval"
              }
            : {})
        })

        if (writeResult.outcome === "duplicate") summary.duplicates += 1
        else if (writeResult.outcome === "imported") summary.imported += 1
        else summary.failed += 1
      } catch (error) {
        summary.failed += 1
        await this.port.recordImportItem({
          batchId: batch.batchId,
          lineNumber: item.line_number,
          rawText: item.raw_text,
          ...(item.raw_json === undefined ? {} : { rawJson: item.raw_json }),
          outcome: "failed",
          errorMessage: errorText(error),
          requestId: context.requestId
        })
      }
    }

    if (input.final_chunk) {
      await this.port.finishImportBatch(batch.batchId)
    }
    return summary
  }

  async depositUserQuestion(
    input: UserQuestionDepositInput
  ): Promise<QuestionDepositReport> {
    const dictionary = tagDictionarySchema.parse(
      await this.port.loadTaggingContext({
        stem: input.userText,
        proposedKnowledgeCodes: [],
        proposedMethodCodes: []
      })
    )
    const normalized = await this.model.generateJson({
      name: "user_question_deposit",
      system: USER_QUESTION_POLICY,
      prompt: `候选标签字典：
${compactDictionary(dictionary)}

用户原始提问：
${input.userText}

本轮已经生成并校验的教学输出：
${JSON.stringify(input.teachingOutput).slice(0, 30_000)}

把题目、答案和解析整理为待人工复核的 draft。`,
      schema: userQuestionNormalizationSchema,
      temperature: 0
    })

    return this.port.writeUserQuestionDraft({
      question: userQuestionToPersistable(normalized, dictionary, input),
      userId: input.userId,
      sessionId: input.sessionId,
      workflowRunId: input.workflowRunId,
      requestId: input.requestId
    })
  }

  listReviewQueue(input: {
    status?: "pending" | "needs_fix"
    limit?: number
    cursor?: string
  }) {
    return this.port.listReviewQueue({
      status: input.status ?? "pending",
      limit: Math.min(Math.max(input.limit ?? 20, 1), 100),
      ...(input.cursor ? { cursor: input.cursor } : {})
    })
  }

  review(
    reviewItemId: string,
    rawDecision: ReviewDecision,
    requestId: string
  ) {
    const decision = reviewDecisionSchema.parse(rawDecision)
    return this.port.applyReview(reviewItemId, decision, requestId)
  }
}
