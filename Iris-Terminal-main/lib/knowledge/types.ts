export type ChatMode = "auto" | "chat_only" | "grounded"

export type RetrievalStrategy =
  | "none"
  | "hybrid_light"
  | "hybrid_standard"
  | "hybrid_forced"

export interface QueryAnalysis {
  query: string
  mode: ChatMode
  shouldRetrieve: boolean
  reason: string
  strategy: RetrievalStrategy
  keywords: string[]
  topK: number
}

export interface RetrievalCandidate {
  chunk_id: string
  note_id: string
  vault_id: string
  path: string
  title: string
  content: string
  heading_path: string[]
  start_line: number | null
  end_line: number | null
  updated_at: string
  vector_score: number
  fulltext_score: number
  graph_score: number
  recency_score: number
  final_score: number
}

export interface SourceReference {
  source_id: string
  chunk_id: string
  note_id: string
  title: string
  path: string
  excerpt: string
  score: number
  lines?: string
}

export interface RetrievalLogPayload {
  chat_id?: string | null
  message_id?: string | null
  query: string
  mode: ChatMode
  strategy: RetrievalStrategy
  recalled_items: Array<{
    chunk_id: string
    note_id: string
    score: number
  }>
  final_context?: {
    sources: SourceReference[]
    token_budget: number
    used_tokens: number
  } | null
}

export interface ContextPacket {
  text: string
  sources: SourceReference[]
  token_budget: number
  used_tokens: number
}

export interface VaultSyncStats {
  scanned_notes: number
  updated_notes: number
  deleted_notes: number
  chunks_written: number
  links_written: number
}
