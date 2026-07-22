import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const chatId = searchParams.get("chat_id")

  if (!chatId) {
    return new NextResponse("chat_id is required", { status: 400 })
  }

  const chatFiles = await prisma.chatFile.findMany({
    where: { chat_id: chatId },
    include: { file: true }
  })

  return NextResponse.json({
    files: chatFiles.map(item => item.file)
  })
}

export async function POST(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const json = await request.json()
  const items = Array.isArray(json) ? json : [json]

  await prisma.chatFile.createMany({
    data: items.map(item => ({
      ...item,
      user_id: user.id
    }))
  })

  return NextResponse.json({ ok: true })
}
