export interface ChatSummaryMatch {
  id: string
  chat_id: string
  workspace_id: string
  summary: string
  model: string
  similarity: number
}

export interface ChatSummaryMessage {
  id: string
  role: string
  content: string
  sequence_number: number
  created_at: string
}

export interface ChatSummaryDetail {
  id: string
  chat_id: string
  user_id: string
  workspace_id: string
  workspace_name?: string
  created_at: string
  updated_at: string | null
  status: string
  model: string
  summary: string
  chat_title: string
  messages?: ChatSummaryMessage[]
}
