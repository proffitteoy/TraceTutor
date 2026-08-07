import { z } from "zod"
import { stateDeltaSchema, type ToolName } from "./contracts.js"

const contextFields = {
  user_id: z.string().trim().min(1).max(128),
  session_id: z.string().trim().min(1).max(128)
}

const limit = z.number().int().min(1).max(20).default(5)
const difficultyPolicy = z.enum(["easier", "near", "harder"]).default("near")

export const toolInputSchemas = {
  "state.query_user_snapshot": z
    .object({
      ...contextFields
    })
    .strict(),

  "state.query_wrong_questions": z
    .object({
      ...contextFields,
      knowledge_area: z.string().trim().min(1).max(128).optional(),
      knowledge_point_ids: z.array(z.string().min(1)).max(20).default([]),
      state_labels: z
        .array(z.enum(["attempted", "understood", "weak", "reviewing", "stable"]))
        .max(5)
        .default(["weak", "reviewing"]),
      recent_only: z.boolean().default(false),
      limit
    })
    .strict(),

  "state.query_review_due_items": z
    .object({
      ...contextFields,
      due_before: z.iso.datetime({ offset: true }).optional(),
      target_types: z
        .array(z.enum(["question", "knowledge_point", "method", "error_pattern"]))
        .max(4)
        .default(["question", "knowledge_point", "method", "error_pattern"]),
      limit
    })
    .strict(),

  "state.write_attempt_result": z
    .object({
      ...contextFields,
      question_id: z.string().min(1).max(128),
      answer_text: z.string().max(20_000),
      judgement: z.enum(["correct", "incorrect", "partial", "ungraded"]),
      knowledge_point_ids: z.array(z.string().min(1)).max(20).default([]),
      method_ids: z.array(z.string().min(1)).max(20).default([]),
      client_event_id: z.string().min(1).max(128)
    })
    .strict(),

  "state.write_review_result": z
    .object({
      ...contextFields,
      schedule_id: z.string().min(1).max(128),
      question_id: z.string().min(1).max(128),
      attempt_id: z.string().min(1).max(128),
      outcome: z.enum(["remembered", "partial", "forgotten"]),
      client_event_id: z.string().min(1).max(128)
    })
    .strict(),

  "state.apply_state_delta": z
    .object({
      ...contextFields,
      pending_state_delta_id: z.string().min(1).max(128),
      state_delta: z.lazy(() => stateDeltaSchema),
      client_event_id: z.string().min(1).max(128)
    })
    .strict(),

  "asset.get_question_detail": z
    .object({
      ...contextFields,
      question_id: z.string().min(1).max(128),
      only_active: z.literal(true).default(true)
    })
    .strict(),

  "asset.search_by_knowledge": z
    .object({
      ...contextFields,
      knowledge_point_ids: z.array(z.string().min(1)).max(20).default([]),
      knowledge_area: z.string().trim().min(1).max(128).optional(),
      difficulty_policy: difficultyPolicy,
      exclude_question_ids: z.array(z.string().min(1)).max(100).default([]),
      limit,
      only_active: z.literal(true).default(true)
    })
    .strict()
    .refine(
      input =>
        input.knowledge_point_ids.length > 0 ||
        input.knowledge_area !== undefined,
      "必须提供 knowledge_point_ids 或 knowledge_area"
    ),

  "asset.search_by_method": z
    .object({
      ...contextFields,
      method_ids: z.array(z.string().min(1)).min(1).max(20),
      difficulty_policy: difficultyPolicy,
      exclude_question_ids: z.array(z.string().min(1)).max(100).default([]),
      limit,
      only_active: z.literal(true).default(true)
    })
    .strict(),

  "asset.search_same_knowledge_different_method": z
    .object({
      ...contextFields,
      base_question_id: z.string().min(1).max(128),
      difficulty_policy: difficultyPolicy,
      exclude_method_ids: z.array(z.string().min(1)).max(20).default([]),
      limit,
      only_active: z.literal(true).default(true)
    })
    .strict(),

  "asset.search_same_method_different_knowledge": z
    .object({
      ...contextFields,
      base_question_id: z.string().min(1).max(128),
      difficulty_policy: difficultyPolicy,
      exclude_knowledge_point_ids: z
        .array(z.string().min(1))
        .max(20)
        .default([]),
      limit,
      only_active: z.literal(true).default(true)
    })
    .strict(),

  "asset.search_similar_questions": z
    .object({
      ...contextFields,
      base_question_id: z.string().min(1).max(128),
      similarity_dimensions: z
        .array(
          z.enum(["knowledge", "method", "structure", "solution_path"])
        )
        .min(1)
        .max(4),
      difficulty_policy: difficultyPolicy,
      limit,
      only_active: z.literal(true).default(true)
    })
    .strict(),

  "asset.create_question": z
    .object({
      ...contextFields,
      stem: z.string().trim().min(1).max(20_000),
      answer: z.string().trim().min(1).max(20_000),
      analysis: z.string().trim().min(1).max(40_000),
      source_type: z.enum(["user_input", "ai_generated", "external_import"]),
      source_reference: z.string().max(1_000).optional(),
      proposed_knowledge_point_ids: z
        .array(z.string().min(1))
        .max(20)
        .default([]),
      proposed_method_ids: z.array(z.string().min(1)).max(20).default([])
    })
    .strict(),

  "asset.get_solution_steps": z
    .object({
      ...contextFields,
      question_id: z.string().min(1).max(128),
      only_active: z.literal(true).default(true)
    })
    .strict(),

  "log.write_agent_event": z
    .object({
      ...contextFields,
      workflow_run_id: z.string().min(1).max(128),
      event_type: z.enum([
        "intent_detected",
        "plan_validated",
        "tool_called",
        "tool_failed",
        "output_ready",
        "state_write_rejected"
      ]),
      summary: z.string().trim().min(1).max(4_000),
      references: z
        .object({
          question_ids: z.array(z.string().min(1)).max(100).default([]),
          attempt_ids: z.array(z.string().min(1)).max(100).default([])
        })
        .strict()
        .default({ question_ids: [], attempt_ids: [] })
    })
    .strict()
} satisfies Record<ToolName, z.ZodType>

export type ToolInput<TName extends ToolName> = z.infer<
  (typeof toolInputSchemas)[TName]
>

export const toolRoutes: ReadonlyArray<{
  name: ToolName
  path: string
}> = [
  {
    name: "state.query_user_snapshot",
    path: "/tools/state/query-user-snapshot"
  },
  {
    name: "state.query_wrong_questions",
    path: "/tools/state/query-wrong-questions"
  },
  {
    name: "state.query_review_due_items",
    path: "/tools/state/query-review-due-items"
  },
  {
    name: "state.write_attempt_result",
    path: "/tools/state/write-attempt-result"
  },
  {
    name: "state.write_review_result",
    path: "/tools/state/write-review-result"
  },
  {
    name: "state.apply_state_delta",
    path: "/tools/state/apply-state-delta"
  },
  {
    name: "asset.get_question_detail",
    path: "/tools/asset/get-question-detail"
  },
  {
    name: "asset.search_by_knowledge",
    path: "/tools/asset/search-by-knowledge"
  },
  {
    name: "asset.search_by_method",
    path: "/tools/asset/search-by-method"
  },
  {
    name: "asset.search_same_knowledge_different_method",
    path: "/tools/asset/search-same-knowledge-different-method"
  },
  {
    name: "asset.search_same_method_different_knowledge",
    path: "/tools/asset/search-same-method-different-knowledge"
  },
  {
    name: "asset.search_similar_questions",
    path: "/tools/asset/search-similar-questions"
  },
  {
    name: "asset.create_question",
    path: "/tools/asset/create-question"
  },
  {
    name: "asset.get_solution_steps",
    path: "/tools/asset/get-solution-steps"
  },
  {
    name: "log.write_agent_event",
    path: "/tools/log/write-agent-event"
  }
]
