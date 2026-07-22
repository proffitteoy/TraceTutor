import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

interface NoteRow {
  id: string
  vault_id: string
  path: string
  title: string
  aliases: string[]
  tags: string[]
  frontmatter: unknown
  content_hash: string
  mtime: Date
  status: string
  created_at: Date
  updated_at: Date
}

interface ChunkRow {
  id: string
  note_id: string
  heading_path: string[]
  block_id: string | null
  content: string
  content_hash: string
  token_count: number
  start_line: number | null
  end_line: number | null
  created_at: Date
  updated_at: Date
}

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const noteId = searchParams.get("note_id")
  const vaultId = searchParams.get("vault_id")
  const notePath = searchParams.get("path")

  if (!noteId && !(vaultId && notePath)) {
    return NextResponse.json(
      { message: "note_id 或 (vault_id + path) 必填" },
      { status: 400 }
    )
  }

  const noteRows = noteId
    ? await prisma.$queryRaw<NoteRow[]>`
        SELECT *
        FROM "notes"
        WHERE "id" = ${noteId}::uuid
        LIMIT 1;
      `
    : await prisma.$queryRaw<NoteRow[]>`
        SELECT *
        FROM "notes"
        WHERE "vault_id" = ${vaultId}::uuid
          AND "path" = ${notePath}
        LIMIT 1;
      `

  const note = noteRows[0]
  if (!note) {
    return NextResponse.json({ message: "Note 不存在" }, { status: 404 })
  }

  const chunks = await prisma.$queryRaw<ChunkRow[]>`
    SELECT *
    FROM "note_chunks"
    WHERE "note_id" = ${note.id}::uuid
    ORDER BY "start_line" ASC NULLS LAST, "created_at" ASC;
  `

  return NextResponse.json({
    note,
    chunks
  })
}
