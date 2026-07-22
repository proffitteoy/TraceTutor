import { composeContextPacket } from "@/lib/agent/context-composer"
import type { Phase2StageHandler } from "@/lib/agent/phase2/contracts"

export const runComposeStage: Phase2StageHandler = context => {
  const startedAt = Date.now()
  const contextPacket = composeContextPacket({
    workspaceName: context.config.workspaceName,
    workspaceInstruction: context.config.workspaceInstruction ?? "",
    query: context.config.query,
    candidates: context.state.candidates,
    tokenBudget: context.config.tokenBudget
  })

  context.state.contextPacket = contextPacket
  context.trace.push({
    stage: "compose",
    status: "ok",
    duration_ms: Date.now() - startedAt,
    detail: `sources=${contextPacket.sources.length}`
  })
}
