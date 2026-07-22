import { prisma } from "@/lib/prisma"
import type { RetrievalLogPayload } from "./types"

export const logRetrievalEvent = async (payload: RetrievalLogPayload) => {
  await prisma.$executeRaw`
    INSERT INTO "retrieval_events" (
      "id",
      "chat_id",
      "message_id",
      "query",
      "mode",
      "strategy",
      "recalled_items",
      "final_context",
      "created_at"
    )
    VALUES (
      gen_random_uuid(),
      ${payload.chat_id ?? null}::uuid,
      ${payload.message_id ?? null}::uuid,
      ${payload.query},
      ${payload.mode},
      ${payload.strategy},
      ${JSON.stringify(payload.recalled_items)}::jsonb,
      ${payload.final_context ? JSON.stringify(payload.final_context) : null}::jsonb,
      CURRENT_TIMESTAMP
    );
  `
}
