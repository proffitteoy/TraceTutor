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

  const messages = await prisma.message.findMany({
    where: { chat_id: chatId },
    orderBy: { sequence_number: "asc" }
  })

  return NextResponse.json(messages)
}

export async function POST(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const json = await request.json()
  const messages = Array.isArray(json) ? json : [json]

  const createdMessages = []

  for (const message of messages) {
    const created = await prisma.message.create({
      data: {
        ...message,
        user_id: user.id
      }
    })
    createdMessages.push(created)
  }

  return NextResponse.json(createdMessages)
}
