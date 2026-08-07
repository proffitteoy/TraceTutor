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
      status: "active_created" | "duplicate" | "failed"
      reason: string
      question_id?: string
      review_item_id?: string
    }
  }
}

export interface PracticeQuestion {
  questionId: string
  title: string
  stem: string
  questionType: string
  difficulty: number
  subjectCode: string
  subjectName: string
}

export interface QuestionAttemptHistoryItem {
  attemptId: string
  sessionId: string | null
  userAnswerText: string | null
  isCorrect: boolean | null
  score: number | null
  attemptStatus: "viewed" | "submitted" | "checked" | "abandoned" | "skipped"
  errorDetailText: string | null
  createdAt: string
  checkedAt: string | null
}

export interface ServiceReadiness {
  ready: boolean
  dependencies: Record<string, string>
}

export interface IrisGateway {
  checkReadiness(signal?: AbortSignal): Promise<ServiceReadiness>
  send(request: LearningRequest, signal?: AbortSignal): Promise<LearningResponse>
  listPracticeQuestions(
    input?: { limit?: number; subjectCode?: string },
    signal?: AbortSignal
  ): Promise<PracticeQuestion[]>
  listQuestionAttempts(
    input: { userId: string; questionId: string; limit?: number },
    signal?: AbortSignal
  ): Promise<QuestionAttemptHistoryItem[]>
}

export const questionAttemptHistorySchema = z
  .object({
    attempts: z.array(
      z.object({
        attemptId: z.string().min(1),
        sessionId: z.string().nullable(),
        userAnswerText: z.string().nullable(),
        isCorrect: z.boolean().nullable(),
        score: z.number().nullable(),
        attemptStatus: z.enum([
          "viewed",
          "submitted",
          "checked",
          "abandoned",
          "skipped"
        ]),
        errorDetailText: z.string().nullable(),
        createdAt: z.string().min(1),
        checkedAt: z.string().nullable()
      }).strict()
    )
  })
  .strict()

export const practiceQuestionListSchema = z
  .object({
    questions: z.array(
      z
        .object({
          questionId: z.string().min(1),
          title: z.string().min(1),
          stem: z.string().min(1),
          questionType: z.string().min(1),
          difficulty: z.number().int().min(1).max(5),
          subjectCode: z.string().min(1),
          subjectName: z.string().min(1)
        })
        .strict()
    )
  })
  .strict()

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
            status: z.enum(["active_created", "duplicate", "failed"]),
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
