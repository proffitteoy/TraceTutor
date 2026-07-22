import { expandByNoteGraph } from "@/lib/knowledge/graph-expander"
import { hybridSearch } from "@/lib/knowledge/hybrid-search"
import { rerankCandidates } from "@/lib/knowledge/reranker"
import type { QueryAnalysis, RetrievalCandidate } from "@/lib/knowledge/types"

interface RetrievalRouterInput {
  analysis: QueryAnalysis
  workspaceId?: string
}

export const runRetrievalRouter = async ({
  analysis,
  workspaceId
}: RetrievalRouterInput): Promise<RetrievalCandidate[]> => {
  if (!analysis.shouldRetrieve || analysis.strategy === "none") {
    return []
  }

  const baseCandidates = await hybridSearch({
    query: analysis.query,
    workspaceId,
    topK: Math.max(analysis.topK, 6)
  })

  const expandedCandidates =
    analysis.strategy === "hybrid_forced" || analysis.strategy === "hybrid_standard"
      ? await expandByNoteGraph({
          candidates: baseCandidates,
          extraNotes: 5,
          extraChunks: 8
        })
      : baseCandidates

  return rerankCandidates({
    query: analysis.query,
    candidates: expandedCandidates,
    limit: analysis.topK
  })
}
