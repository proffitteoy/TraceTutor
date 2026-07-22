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
}

export interface LearningResponse {
  render_type: "learning_response"
  mode: InputMode | "review_and_variant"
  summary: string
  cards: LearningCard[]
  actions: LearningAction[]
  pending_state_write: boolean
  meta: {
    source: "demo" | "gateway"
    request_id: string
  }
}

export interface IrisGateway {
  send(request: LearningRequest, signal?: AbortSignal): Promise<LearningResponse>
}
