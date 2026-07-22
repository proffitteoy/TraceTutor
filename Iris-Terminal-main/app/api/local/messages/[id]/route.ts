import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const json = await request.json()

  const message = await prisma.message.update({
    where: { id: params.id },
    data: json
  })

  return NextResponse.json(message)
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const message = await prisma.message.findUnique({
    where: { id: params.id }
  })

  if (!message) {
    return new NextResponse("Not found", { status: 404 })
  }

  return NextResponse.json(message)
}
