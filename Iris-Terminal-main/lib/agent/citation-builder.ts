import type { SourceReference } from "@/lib/knowledge/types"

interface CitationBuildInput {
  sources: SourceReference[]
}

export const buildCitations = ({ sources }: CitationBuildInput) => {
  return sources.map(source => ({
    source_id: source.source_id,
    title: source.title,
    path: source.path,
    lines: source.lines,
    score: Number(source.score.toFixed(4))
  }))
}
