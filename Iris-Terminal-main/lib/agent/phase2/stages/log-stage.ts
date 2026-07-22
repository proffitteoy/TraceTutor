import { logRetrievalEvent } from "@/lib/knowledge/retrieval-logger"
import type { RetrievalLogPayload } from "@/lib/knowledge/types"
import type { Phase2StageHandler } from "@/lib/agent/phase2/contracts"

export const runLogStage: Phase2StageHandler = async context => {
  const analysis = context.state.analysis
  const contextPacket = context.state.contextPacket
  const shouldLogEvent = context.config.shouldLogEvent ?? true

  if (!analysis || !analysis.shouldRetrieve || !shouldLogEvent || !contextPacket) {
    context.trace.push({
      stage: "log",
      status: "skipped",
      duration_ms: 0,
      detail: analysis?.shouldRetrieve ? "shouldLogEvent=false or context missing" : "no retrieval"
    })
    return
  }

  const startedAt = Date.now()
  const logPayload: RetrievalLogPayload = {
    chat_id: context.config.chatId ?? null,
    message_id: context.config.messageId ?? null,
    query: context.config.query,
    mode: analysis.mode,
    strategy: analysis.strategy,
    recalled_items: context.state.candidates.map(item => ({
      chunk_id: item.chunk_id,
      note_id: item.note_id,
      score: item.final_score
    })),
    final_context: {
      sources: contextPacket.sources,
      token_budget: contextPacket.token_budget,
      used_tokens: contextPacket.used_tokens
    }
  }
  await logRetrievalEvent(logPayload)

  context.trace.push({
    stage: "log",
    status: "ok",
    duration_ms: Date.now() - startedAt
  })
}
