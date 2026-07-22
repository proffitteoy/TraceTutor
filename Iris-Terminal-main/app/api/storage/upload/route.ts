import { writeStorageFile } from "@/lib/local-storage"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const formData = await request.formData()

  const bucket = formData.get("bucket") as string
  const relativePath = formData.get("path") as string
  const file = formData.get("file") as File

  if (!bucket || !relativePath || !file) {
    return new NextResponse("Invalid upload payload", { status: 400 })
  }

  if (relativePath.includes("..") || bucket.includes("..")) {
    return new NextResponse("Invalid path", { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  await writeStorageFile(`${bucket}/${relativePath}`, buffer)

  return NextResponse.json({ path: relativePath })
}
