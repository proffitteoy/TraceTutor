import { getStorageRoot } from "@/lib/local-storage"
import { NextResponse } from "next/server"
import path from "path"
import { promises as fs } from "fs"

export async function POST(request: Request) {
  const json = await request.json()
  const { bucket, path: relativePath } = json as {
    bucket: string
    path: string
  }

  if (!bucket || !relativePath) {
    return new NextResponse("Invalid payload", { status: 400 })
  }

  if (relativePath.includes("..") || bucket.includes("..")) {
    return new NextResponse("Invalid path", { status: 400 })
  }

  const fullPath = path.join(getStorageRoot(), bucket, relativePath)

  try {
    await fs.unlink(fullPath)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return new NextResponse("Not found", { status: 404 })
  }
}
