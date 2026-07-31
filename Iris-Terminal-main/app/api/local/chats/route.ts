import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspace_id")

  const chats = await prisma.chat.findMany({
    where: {
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
      card_relation: "root"
    },
    orderBy: { created_at: "desc" }
  })

  return NextResponse.json(chats)
}

export async function POST(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const json = await request.json()
  const chatId = typeof json.id === "string" ? json.id : randomUUID()
  const {
    id: _id,
    user_id: _userId,
    tree_id: _treeId,
    source_chat_id: _sourceChatId,
    source_message_id: _sourceMessageId,
    card_relation: _cardRelation,
    source_quote: _sourceQuote,
    selection_start: _selectionStart,
    selection_end: _selectionEnd,
    fork_sequence_number: _forkSequenceNumber,
    branch_context: _branchContext,
    card_x: _cardX,
    card_y: _cardY,
    ...chatData
  } = json

  const chat = await prisma.$transaction(async tx => {
    await tx.chatTree.create({
      data: {
        id: chatId,
        user_id: user.id,
        workspace_id: chatData.workspace_id
      }
    })

    return tx.chat.create({
      data: {
        ...chatData,
        id: chatId,
        user_id: user.id,
        tree_id: chatId,
        card_relation: "root",
        branch_context: "",
        card_x: 0,
        card_y: 0
      }
    })
  })

  return NextResponse.json(chat)
}
