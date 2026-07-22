import { readStorageFile } from "@/lib/local-storage"
import { lookup } from "mime-types"
import { NextResponse } from "next/server"
import path from "path"

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  const relativePath = params.path?.join("/") || ""

  if (relativePath.includes("..")) {
    return new NextResponse("Invalid path", { status: 400 })
  }

  try {
    const data = await readStorageFile(relativePath)
    const contentType =
      lookup(path.extname(relativePath)) || "application/octet-stream"

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType
      }
    })
  } catch (error: any) {
    return new NextResponse("Not found", { status: 404 })
  }
}
