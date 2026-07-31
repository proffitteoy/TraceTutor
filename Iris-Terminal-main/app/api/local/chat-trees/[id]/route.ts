import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await ensureLocalBootstrap()

  const tree = await prisma.chatTree.findFirst({
    where: {
      id: params.id,
      user_id: user.id
    },
    include: {
      chats: {
        orderBy: { created_at: "asc" },
        include: {
          _count: {
            select: {
              messages: true,
              child_chats: true
            }
          },
          messages: {
            orderBy: { sequence_number: "desc" },
            take: 1,
            select: {
              content: true,
              role: true,
              sequence_number: true
            }
          }
        }
      }
    }
  })

  if (!tree) {
    return new NextResponse("Not found", { status: 404 })
  }

  return NextResponse.json({
    id: tree.id,
    user_id: tree.user_id,
    workspace_id: tree.workspace_id,
    created_at: tree.created_at,
    updated_at: tree.updated_at,
    cards: tree.chats.map(({ _count, messages, ...chat }) => ({
      ...chat,
      message_count: _count.messages,
      child_count: _count.child_chats,
      last_message: messages[0] || null
    }))
  })
}
