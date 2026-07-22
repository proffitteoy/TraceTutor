import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const chat = await prisma.chat.findUnique({ where: { id: params.id } })

  if (!chat) {
    return new NextResponse("Not found", { status: 404 })
  }

  return NextResponse.json(chat)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const json = await request.json()

  const chat = await prisma.chat.update({
    where: { id: params.id },
    data: json
  })

  return NextResponse.json(chat)
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  await prisma.chat.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
