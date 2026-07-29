import { z } from "zod"

export const inputModes = ["new_question", "review", "free_chat"] as const
export const learningActionTypes = [
  "submit_answer",
  "request_hint",
  "generate_variant"
] as const

export const learningRequestSchema = z
  .object({
    session_id: z.string().trim().min(1).max(128),
    user_id: z.string().trim().min(1).max(128),
    input_mode: z.enum(inputModes),
    user_text: z.string().trim().min(1).max(20_000),
    attachments: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(128),
          name: z.string().trim().min(1).max(255),
          mime_type: z.string().trim().min(1).max(128)
        })
      )
      .max(8),
    active_question_id: z.string().trim().min(1).max(128).nullable(),
    action: z
      .object({
        type: z.enum(learningActionTypes),
        question_id: z.string().trim().min(1).max(128).optional(),
        schedule_id: z.string().trim().min(1).max(128).optional(),
        client_event_id: z.string().trim().min(1).max(128)
      })
      .strict()
      .optional()
  })
  .strict()

export const solutionCardSchema = z
  .object({
    type: z.literal("solution"),
    title: z.string().min(1),
    content: z.string(),
    steps: z.array(z.string()),
    methods: z.array(z.string())
  })
  .strict()

export const methodCardSchema = z
  .object({
    type: z.enum([
      "method_summary",
      "method_diagnosis",
      "method_comparison"
    ]),
    title: z.string().min(1),
    content: z.string(),
    tags: z.array(z.string()).optional()
  })
  .strict()

export const questionCardSchema = z
  .object({
    type: z.enum(["new_question", "old_question_review"]),
    title: z.string().min(1),
    question_id: z.string().min(1),
    content: z.string(),
    difficulty: z.number().int().min(1).max(5).optional()
  })
  .strict()

export const stateCardSchema = z
  .object({
    type: z.literal("state_change"),
    title: z.string().min(1),
    content: z.string(),
    status: z.enum(["pending", "applied", "rejected"])
  })
  .strict()

export const learningCardSchema = z.union([
  solutionCardSchema,
  methodCardSchema,
  questionCardSchema,
  stateCardSchema
])

export const learningActionSchema = z
  .object({
    type: z.enum(learningActionTypes),
    label: z.string().min(1),
    question_id: z.string().min(1).optional(),
    schedule_id: z.string().min(1).optional()
  })
  .strict()

export const learningResponseSchema = z
  .object({
    render_type: z.literal("learning_response"),
    mode: z.enum([...inputModes, "review_and_variant"]),
    summary: z.string(),
    cards: z.array(learningCardSchema),
    actions: z.array(learningActionSchema),
    pending_state_write: z.boolean(),
    meta: z
      .object({
        source: z.enum(["local_agent", "degraded"]),
        request_id: z.string().min(1),
        workflow_run_id: z.string().min(1).optional()
      })
      .strict()
  })
  .strict()

export const taskTypes = [
  "NEW_QUESTION_SOLVE",
  "GENERATE_SIMILAR_QUESTION",
  "REVIEW_OLD_QUESTION",
  "SCHEDULED_REVIEW",
  "METHOD_TRANSFER",
  "KNOWLEDGE_DIAGNOSIS",
  "STATE_UPDATE_ONLY",
  "CLARIFY_INTENT"
] as const

export const intents = [
  ...taskTypes,
  "REVIEW_AND_VARIANT"
] as const

export const stateQueryTools = [
  "state.query_user_snapshot",
  "state.query_wrong_questions",
  "state.query_review_due_items"
] as const

export const assetQueryTools = [
  "asset.get_question_detail",
  "asset.search_by_knowledge",
  "asset.search_by_method",
  "asset.search_same_knowledge_different_method",
  "asset.search_same_method_different_knowledge",
  "asset.search_similar_questions",
  "asset.get_solution_steps"
] as const

export const writeTools = [
  "state.write_attempt_result",
  "state.write_review_result",
  "state.apply_state_delta",
  "asset.create_draft_question",
  "log.write_agent_event"
] as const

export const toolNames = [
  ...stateQueryTools,
  ...assetQueryTools,
  ...writeTools
] as const

const queryFiltersSchema = z
  .record(z.string().min(1), z.unknown())
  .refine(
    filters =>
      !Object.keys(filters).some(key =>
        ["sql", "query", "where_clause", "raw_sql"].includes(key.toLowerCase())
      ),
    "查询计划不得包含 SQL 或原始查询表达式"
  )

export const queryPlanSchema = z
  .object({
    version: z.literal("1.0"),
    intent: z.enum(intents),
    task_types: z.array(z.enum(taskTypes)).min(1).max(8),
    state_queries: z
      .array(
        z
          .object({
            tool: z.enum(stateQueryTools),
            filters: queryFiltersSchema.default({}),
            limit: z.number().int().min(1).max(20).optional()
          })
          .strict()
      )
      .max(8),
    asset_queries: z
      .array(
        z
          .object({
            tool: z.enum(assetQueryTools),
            base_question_id: z.string().min(1).max(128).optional(),
            filters: queryFiltersSchema.default({}),
            difficulty_policy: z.enum(["easier", "near", "harder"]).optional(),
            limit: z.number().int().min(1).max(20).optional()
          })
          .strict()
      )
      .max(8),
    expected_output: z
      .object({
        include_old_review: z.boolean().default(false),
        include_new_question: z.boolean().default(false),
        include_method_comparison: z.boolean().default(false),
        include_state_update: z.boolean().default(false)
      })
      .strict()
  })
  .strict()

export const stateDeltaSchema = z
  .object({
    target_type: z.enum([
      "knowledge_mastery",
      "method_mastery",
      "error_pattern",
      "review_schedule",
      "context_summary"
    ]),
    target_id: z.string().trim().min(1).max(128),
    proposed_change: z.number().min(-1).max(1).optional(),
    proposed_status: z
      .enum(["attempted", "understood", "weak", "reviewing", "stable"])
      .optional(),
    reason: z.string().trim().min(1).max(1_000),
    evidence: z
      .object({
        question_id: z.string().trim().min(1).max(128),
        attempt_id: z.string().trim().min(1).max(128).optional(),
        review_event_id: z.string().trim().min(1).max(128).optional(),
        judgement: z.enum(["correct", "incorrect", "partial", "ungraded"]),
        knowledge_point_ids: z.array(z.string().min(1)).default([]),
        method_ids: z.array(z.string().min(1)).default([])
      })
      .strict()
  })
  .strict()
  .refine(
    delta =>
      delta.evidence.attempt_id !== undefined ||
      delta.evidence.review_event_id !== undefined,
    {
      message: "正式状态建议必须引用 attempt_id 或 review_event_id",
      path: ["evidence"]
    }
  )
  .refine(
    delta =>
      delta.proposed_change !== undefined ||
      delta.proposed_status !== undefined,
    {
      message: "状态建议必须给出 proposed_change 或 proposed_status"
    }
  )
  .refine(
    delta =>
      delta.target_type !== "knowledge_mastery" ||
      delta.evidence.knowledge_point_ids.includes(delta.target_id),
    {
      message: "知识点状态建议必须由同一 knowledge_point_id 的证据支持",
      path: ["target_id"]
    }
  )
  .refine(
    delta =>
      delta.target_type !== "method_mastery" ||
      delta.evidence.method_ids.includes(delta.target_id),
    {
      message: "方法状态建议必须由同一 method_id 的证据支持",
      path: ["target_id"]
    }
  )

export const toolResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    meta: z
      .object({
        source: z.enum(["pgsql", "sqlite", "api"]),
        status: z.enum(["ok", "empty", "degraded"]),
        reason: z.string().min(1),
        request_id: z.string().min(1).optional()
      })
      .strict()
  })
  .strict()
  .refine(value => value.items !== undefined || value.result !== undefined, {
    message: "工具结果必须包含 items 或 result"
  })

export type LearningRequest = z.infer<typeof learningRequestSchema>
export type LearningResponse = z.infer<typeof learningResponseSchema>
export type QueryPlan = z.infer<typeof queryPlanSchema>
export type StateDelta = z.infer<typeof stateDeltaSchema>
export type ToolName = (typeof toolNames)[number]
export type ToolResult = z.infer<typeof toolResultSchema>
