import { Tables } from "./database"

export type CardRelation = "root" | "child" | "divergent" | "branch"

export interface ChatTreeCard extends Tables<"chats"> {
  message_count: number
  child_count: number
  last_message: {
    content: string
    role: string
    sequence_number: number
  } | null
}

export interface ChatTreeResponse {
  id: string
  user_id: string
  workspace_id: string
  created_at: string
  updated_at: string | null
  cards: ChatTreeCard[]
}

export interface CreateCardRequest {
  source_chat_id: string
  relation: Exclude<CardRelation, "root">
  source_message_id?: string
  source_quote?: string
  selection_start?: number
  selection_end?: number
  fork_sequence_number?: number
  card_x?: number
  card_y?: number
}

export interface UpdateCardRequest {
  card_x?: number
  card_y?: number
  name?: string
}
