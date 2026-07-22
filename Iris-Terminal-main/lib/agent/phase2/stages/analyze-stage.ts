import { analyzeQuery } from "@/lib/agent/query-analyzer"
import type { Phase2StageHandler } from "@/lib/agent/phase2/contracts"

export const runAnalyzeStage: Phase2StageHandler = context => {
  const startedAt = Date.now()
  const { query, mode, topK } = context.config

  const analysis = analyzeQuery({
    query,
    mode,
    topK
  })

  context.state.analysis = analysis
  context.trace.push({
    stage: "analyze",
    status: "ok",
    duration_ms: Date.now() - startedAt,
    detail: analysis.reason
  })
}
