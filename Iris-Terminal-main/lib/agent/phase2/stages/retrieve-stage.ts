import { runRetrievalRouter } from "@/lib/agent/retrieval-router"
import type { Phase2StageHandler } from "@/lib/agent/phase2/contracts"

export const runRetrieveStage: Phase2StageHandler = async context => {
  const analysis = context.state.analysis
  if (!analysis || !analysis.shouldRetrieve) {
    context.trace.push({
      stage: "retrieve",
      status: "skipped",
      duration_ms: 0,
      detail: analysis ? "analysis.shouldRetrieve=false" : "analysis missing"
    })
    context.state.candidates = []
    return
  }

  const startedAt = Date.now()
  const candidates = await runRetrievalRouter({
    analysis,
    workspaceId: context.config.workspaceId
  })
  context.state.candidates = candidates

  context.trace.push({
    stage: "retrieve",
    status: "ok",
    duration_ms: Date.now() - startedAt,
    detail: `candidates=${candidates.length}`
  })
}
