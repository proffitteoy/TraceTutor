import type {
  ContextPacket,
  RetrievalCandidate,
  SourceReference
} from "@/lib/knowledge/types"

interface ComposeContextInput {
  workspaceName?: string
  workspaceInstruction?: string
  query: string
  candidates: RetrievalCandidate[]
  tokenBudget?: number
}

const excerpt = (content: string, maxLength = 420) =>
  content.length > maxLength ? `${content.slice(0, maxLength)}...` : content

const toSourceReference = (candidate: RetrievalCandidate): SourceReference => ({
  source_id: `${candidate.note_id}:${candidate.chunk_id}`,
  chunk_id: candidate.chunk_id,
  note_id: candidate.note_id,
  title: candidate.title,
  path: candidate.path,
  excerpt: excerpt(candidate.content),
  score: candidate.final_score,
  lines:
    candidate.start_line && candidate.end_line
      ? `${candidate.start_line}-${candidate.end_line}`
      : undefined
})

export const composeContextPacket = ({
  workspaceName,
  workspaceInstruction,
  query,
  candidates,
  tokenBudget = 1800
}: ComposeContextInput): ContextPacket => {
  const sources: SourceReference[] = []
  const blocks: string[] = []
  let usedTokens = 0

  for (const candidate of candidates) {
    if (usedTokens >= tokenBudget) break
    const estimatedTokens = Math.max(1, Math.ceil(candidate.content.length / 4))
    if (usedTokens + estimatedTokens > tokenBudget && sources.length > 0) {
      break
    }

    usedTokens += estimatedTokens
    const source = toSourceReference(candidate)
    sources.push(source)
    blocks.push(
      `<source id="${source.source_id}" title="${source.title}" path="${source.path}" lines="${source.lines ?? ""}">\n${source.excerpt}\n</source>`
    )
  }

  const text = [
    "[Workspace Context]",
    `workspace_name: ${workspaceName ?? "default"}`,
    `workspace_instruction: ${workspaceInstruction ?? ""}`,
    "",
    "[Retrieved Notes]",
    blocks.length > 0 ? blocks.join("\n\n") : "(none)",
    "",
    "[Current Conversation]",
    `user: ${query}`
  ].join("\n")

  return {
    text,
    sources,
    token_budget: tokenBudget,
    used_tokens: usedTokens
  }
}
