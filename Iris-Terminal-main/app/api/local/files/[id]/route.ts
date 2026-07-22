import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  const json = await request.json()

  const file = await prisma.file.update({
    where: { id: params.id },
    data: json
  })

  return NextResponse.json(file)
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await ensureLocalBootstrap()
  await prisma.file.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
