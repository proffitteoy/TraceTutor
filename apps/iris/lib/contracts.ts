import { z } from "zod"

export type InputMode = "new_question" | "review" | "free_chat"

export interface LearningRequest {
  session_id: string
  user_id: string
  input_mode: InputMode
  user_text: string
  attachments: Array<{
    id: string
    name: string
    mime_type: string
  }>
  active_question_id: string | null
  action?: {
    type: LearningActionType
    question_id?: string
    schedule_id?: string
    client_event_id: string
  }
}

export type LearningCard =
  | {
      type: "solution"
      title: string
      content: string
      steps: string[]
      methods: string[]
    }
  | {
      type: "method_summary" | "method_diagnosis" | "method_comparison"
      title: string
      content: string
      tags?: string[]
    }
  | {
      type: "new_question" | "old_question_review"
      title: string
      question_id: string
      content: string
      difficulty?: number
    }
  | {
      type: "state_change"
      title: string
      content: string
      status: "pending" | "applied" | "rejected"
    }

export type LearningActionType =
  | "submit_answer"
  | "request_hint"
  | "generate_variant"

export interface LearningAction {
  type: LearningActionType
  label: string
  question_id?: string
  schedule_id?: string
}

export interface LearningResponse {
  render_type: "learning_response"
  mode: InputMode | "review_and_variant"
  summary: string
  cards: LearningCard[]
  actions: LearningAction[]
  pending_state_write: boolean
  meta: {
    source: "local_agent" | "degraded"
    request_id: string
    workflow_run_id?: string
    question_deposit?: {
      status: "draft_created" | "duplicate" | "failed"
      reason: string
      question_id?: string
      review_item_id?: string
    }
  }
}

export interface IrisGateway {
  send(request: LearningRequest, signal?: AbortSignal): Promise<LearningResponse>
}

const learningCardSchema = z.union([
  z
    .object({
      type: z.literal("solution"),
      title: z.string(),
      content: z.string(),
      steps: z.array(z.string()),
      methods: z.array(z.string())
    })
    .strict(),
  z
    .object({
      type: z.enum([
        "method_summary",
        "method_diagnosis",
        "method_comparison"
      ]),
      title: z.string(),
      content: z.string(),
      tags: z.array(z.string()).optional()
    })
    .strict(),
  z
    .object({
      type: z.enum(["new_question", "old_question_review"]),
      title: z.string(),
      question_id: z.string().min(1),
      content: z.string(),
      difficulty: z.number().int().min(1).max(5).optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("state_change"),
      title: z.string(),
      content: z.string(),
      status: z.enum(["pending", "applied", "rejected"])
    })
    .strict()
])

export const learningResponseSchema: z.ZodType<LearningResponse> = z
  .object({
    render_type: z.literal("learning_response"),
    mode: z.enum([
      "new_question",
      "review",
      "free_chat",
      "review_and_variant"
    ]),
    summary: z.string(),
    cards: z.array(learningCardSchema),
    actions: z.array(
      z
        .object({
          type: z.enum([
            "submit_answer",
            "request_hint",
            "generate_variant"
          ]),
          label: z.string().min(1),
          question_id: z.string().min(1).optional(),
          schedule_id: z.string().min(1).optional()
        })
        .strict()
    ),
    pending_state_write: z.boolean(),
    meta: z
      .object({
        source: z.enum(["local_agent", "degraded"]),
        request_id: z.string().min(1),
        workflow_run_id: z.string().min(1).optional(),
        question_deposit: z
          .object({
            status: z.enum(["draft_created", "duplicate", "failed"]),
            reason: z.string().min(1),
            question_id: z.string().min(1).optional(),
            review_item_id: z.string().min(1).optional()
          })
          .strict()
          .optional()
      })
      .strict()
  })
  .strict()
