import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspace_id")

  const chats = await prisma.chat.findMany({
    where: workspaceId ? { workspace_id: workspaceId } : undefined,
    orderBy: { created_at: "desc" }
  })

  return NextResponse.json(chats)
}

export async function POST(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const json = await request.json()

  const chat = await prisma.chat.create({
    data: {
      ...json,
      user_id: user.id
    }
  })

  return NextResponse.json(chat)
}
