import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await ensureLocalBootstrap()

  const summary = await prisma.chatSummary.findUnique({
    where: { id: params.id },
    select: { id: true, user_id: true }
  })

  if (!summary) {
    return NextResponse.json({ message: "Summary not found" }, { status: 404 })
  }

  if (summary.user_id !== user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 })
  }

  await prisma.chatSummary.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
