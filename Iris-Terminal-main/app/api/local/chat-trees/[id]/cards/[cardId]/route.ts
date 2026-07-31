import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { UpdateCardRequest } from "@/types"
import { NextResponse } from "next/server"

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; cardId: string } }
) {
  const { user } = await ensureLocalBootstrap()
  const input = (await request.json()) as UpdateCardRequest

  const card = await prisma.chat.findFirst({
    where: {
      id: params.cardId,
      tree_id: params.id,
      user_id: user.id
    }
  })

  if (!card) {
    return new NextResponse("Not found", { status: 404 })
  }

  const data: UpdateCardRequest = {}
  if (typeof input.card_x === "number") data.card_x = input.card_x
  if (typeof input.card_y === "number") data.card_y = input.card_y
  if (typeof input.name === "string" && input.name.trim()) {
    data.name = input.name.trim().slice(0, 100)
  }

  const updated = await prisma.chat.update({
    where: { id: card.id },
    data
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; cardId: string } }
) {
  const { user } = await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const confirmSubtree = searchParams.get("confirm_subtree") === "true"

  const card = await prisma.chat.findFirst({
    where: {
      id: params.cardId,
      tree_id: params.id,
      user_id: user.id
    },
    include: {
      _count: { select: { child_chats: true } }
    }
  })

  if (!card) {
    return new NextResponse("Not found", { status: 404 })
  }

  if (card.card_relation === "root") {
    return new NextResponse("Delete the root chat from the sidebar", {
      status: 400
    })
  }

  if (card._count.child_chats > 0 && !confirmSubtree) {
    return NextResponse.json(
      {
        error: "subtree_confirmation_required",
        direct_child_count: card._count.child_chats
      },
      { status: 409 }
    )
  }

  await prisma.chat.delete({ where: { id: card.id } })
  return NextResponse.json({ ok: true })
}
