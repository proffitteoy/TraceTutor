import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id }
  })

  if (!workspace) {
    return new NextResponse("Not found", { status: 404 })
  }

  return NextResponse.json(workspace)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const json = await request.json()

  const workspace = await prisma.workspace.update({
    where: { id: params.id },
    data: json
  })

  return NextResponse.json(workspace)
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  await prisma.workspace.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
