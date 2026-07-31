import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspace_id")
  const fileId = searchParams.get("file_id")

  if (fileId) {
    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file) {
      return new NextResponse("Not found", { status: 404 })
    }
    return NextResponse.json(file)
  }

  if (!workspaceId) {
    return new NextResponse("workspace_id is required", { status: 400 })
  }

  const fileWorkspaces = await prisma.fileWorkspace.findMany({
    where: { workspace_id: workspaceId },
    include: { file: true }
  })

  return NextResponse.json({
    files: fileWorkspaces.map(item => item.file)
  })
}

export async function POST(request: Request) {
  const { handleFileUpload } = await import("@/lib/server/files/upload-file")
  return handleFileUpload(request)
}
