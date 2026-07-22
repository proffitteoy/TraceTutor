import type {
  ChatMode,
  ContextPacket,
  QueryAnalysis,
  RetrievalCandidate
} from "@/lib/knowledge/types"

export interface CitationItem {
  source_id: string
  title: string
  path: string
  lines?: string
  score: number
}

export interface WorkspaceContextSnapshot {
  id: string
  name: string
  instructions: string
}

export type Phase2StageName =
  | "analyze"
  | "retrieve"
  | "compose"
  | "cite"
  | "log"

export interface Phase2StageTrace {
  stage: Phase2StageName
  status: "ok" | "skipped"
  duration_ms: number
  detail?: string
}

export interface Phase2RunConfig {
  query: string
  mode: ChatMode
  workspaceId: string
  workspaceName: string
  workspaceInstruction?: string
  topK?: number
  chatId?: string | null
  messageId?: string | null
  tokenBudget?: number
  shouldLogEvent?: boolean
}

export interface Phase2ExecutionState {
  analysis?: QueryAnalysis
  candidates: RetrievalCandidate[]
  contextPacket?: ContextPacket
  citations: CitationItem[]
}

export interface Phase2FrameworkResult {
  analysis: QueryAnalysis
  candidates: RetrievalCandidate[]
  contextPacket: ContextPacket
  citations: CitationItem[]
  trace: Phase2StageTrace[]
}

export interface Phase2StageContext {
  config: Phase2RunConfig
  state: Phase2ExecutionState
  trace: Phase2StageTrace[]
}

export type Phase2StageHandler = (
  context: Phase2StageContext
) => Promise<void> | void
