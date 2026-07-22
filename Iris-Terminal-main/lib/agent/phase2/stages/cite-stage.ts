import { buildCitations } from "@/lib/agent/citation-builder"
import type { Phase2StageHandler } from "@/lib/agent/phase2/contracts"

export const runCiteStage: Phase2StageHandler = context => {
  const contextPacket = context.state.contextPacket
  if (!contextPacket) {
    context.trace.push({
      stage: "cite",
      status: "skipped",
      duration_ms: 0,
      detail: "context packet missing"
    })
    context.state.citations = []
    return
  }

  const startedAt = Date.now()
  const citations = buildCitations({
    sources: contextPacket.sources
  })
  context.state.citations = citations
  context.trace.push({
    stage: "cite",
    status: "ok",
    duration_ms: Date.now() - startedAt,
    detail: `citations=${citations.length}`
  })
}
