import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  await ensureLocalBootstrap()
  const json = await request.json()
  const { chat_id, sequence_number } = json as {
    chat_id: string
    sequence_number: number
  }

  if (!chat_id || sequence_number === undefined) {
    return new NextResponse("Invalid payload", { status: 400 })
  }

  await prisma.message.deleteMany({
    where: {
      chat_id,
      sequence_number: {
        gte: sequence_number
      }
    }
  })

  return NextResponse.json({ ok: true })
}
