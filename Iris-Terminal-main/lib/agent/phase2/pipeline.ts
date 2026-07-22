import type {
  Phase2StageContext,
  Phase2StageHandler,
  Phase2StageName
} from "@/lib/agent/phase2/contracts"

export const PHASE2_STAGE_ORDER: Phase2StageName[] = [
  "analyze",
  "retrieve",
  "compose",
  "cite",
  "log"
]

export const runPhase2StagePipeline = async (
  context: Phase2StageContext,
  handlers: Partial<Record<Phase2StageName, Phase2StageHandler>>
) => {
  for (const stage of PHASE2_STAGE_ORDER) {
    const handler = handlers[stage]
    if (!handler) {
      context.trace.push({
        stage,
        status: "skipped",
        duration_ms: 0,
        detail: "stage handler not configured"
      })
      continue
    }

    await handler(context)
  }
}
