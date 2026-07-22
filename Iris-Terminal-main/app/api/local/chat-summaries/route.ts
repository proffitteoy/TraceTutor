import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

const MAX_LIMIT = 500

export async function GET(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspace_id")
  const includeMessages = searchParams.get("include_messages") === "true"
  const limitRaw = searchParams.get("limit")
  const parsedLimit = limitRaw ? Number(limitRaw) : NaN
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(parsedLimit, MAX_LIMIT))
    : undefined

  const summaries = await prisma.chatSummary.findMany({
    where: {
      user_id: user.id,
      ...(workspaceId ? { workspace_id: workspaceId } : {})
    },
    orderBy: { created_at: "desc" },
    ...(limit ? { take: limit } : {}),
    include: includeMessages
      ? {
          chat: {
            select: {
              name: true,
              messages: {
                select: {
                  id: true,
                  role: true,
                  content: true,
                  sequence_number: true,
                  created_at: true
                },
                orderBy: { sequence_number: "asc" }
              }
            }
          },
          workspace: {
            select: {
              name: true
            }
          }
        }
      : {
          chat: {
            select: {
              name: true
            }
          },
          workspace: {
            select: {
              name: true
            }
          }
        }
  })

  const payload = summaries.map(summary => {
    const { chat, workspace, ...rest } = summary
    const messages =
      includeMessages && chat && "messages" in chat ? chat.messages : undefined

    return {
      ...rest,
      chat_title: chat?.name || "\u672a\u547d\u540d\u5bf9\u8bdd",
      workspace_name: workspace?.name || "\u9ed8\u8ba4\u9879\u76ee",
      messages
    }
  })

  return NextResponse.json(payload)
}
