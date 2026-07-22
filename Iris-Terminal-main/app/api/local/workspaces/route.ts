import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const { user } = await ensureLocalBootstrap()
  const workspaces = await prisma.workspace.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: "desc" }
  })

  return NextResponse.json(workspaces)
}

export async function POST(request: Request) {
  const { user } = await ensureLocalBootstrap()
  const json = await request.json()
  const workspaceId = json.id || crypto.randomUUID()

  const workspace = await prisma.workspace.create({
    data: {
      id: workspaceId,
      ...json,
      user_id: user.id
    }
  })

  return NextResponse.json(workspace)
}
