import type { RetrievalCandidate } from "./types"

interface RerankInput {
  query: string
  candidates: RetrievalCandidate[]
  limit: number
}

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim()

const overlapScore = (query: string, content: string) => {
  const q = normalizeText(query)
  const c = normalizeText(content)
  if (!q || !c) return 0
  const tokens = q
    .split(/[\s,.;:!?，。；：！？、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
  if (tokens.length === 0) return 0
  const hit = tokens.filter(token => c.includes(token)).length
  return hit / tokens.length
}

export const rerankCandidates = ({
  query,
  candidates,
  limit
}: RerankInput): RetrievalCandidate[] => {
  const deduped = new Map<string, RetrievalCandidate>()

  for (const candidate of candidates) {
    const existing = deduped.get(candidate.chunk_id)
    if (!existing || existing.final_score < candidate.final_score) {
      deduped.set(candidate.chunk_id, candidate)
    }
  }

  return Array.from(deduped.values())
    .map(candidate => {
      const overlap = overlapScore(query, candidate.content)
      const rerankedScore = candidate.final_score * 0.8 + overlap * 0.2
      return {
        ...candidate,
        final_score: rerankedScore
      }
    })
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, limit)
}
