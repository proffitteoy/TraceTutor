import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get("message_id")

  if (!messageId) {
    return new NextResponse("message_id is required", { status: 400 })
  }

  const items = await prisma.messageFileItem.findMany({
    where: { message_id: messageId },
    include: { file_item: true }
  })

  return NextResponse.json({
    id: messageId,
    file_items: items.map(item => item.file_item)
  })
}

export async function POST(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const json = await request.json()
  const items = Array.isArray(json) ? json : [json]

  await prisma.messageFileItem.createMany({
    data: items.map(item => ({
      ...item,
      user_id: user.id
    }))
  })

  return NextResponse.json({ ok: true })
}
