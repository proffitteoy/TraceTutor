import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

interface OutgoingLinkRow {
  id: string
  source_note_id: string
  target_note_id: string | null
  target_path: string
  link_text: string | null
  link_type: string
  target_title: string | null
}

interface IncomingLinkRow {
  id: string
  source_note_id: string
  source_path: string
  source_title: string
  link_type: string
  link_text: string | null
}

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const noteId = searchParams.get("note_id")

  if (!noteId) {
    return NextResponse.json({ message: "note_id 为必填" }, { status: 400 })
  }

  const outgoing = await prisma.$queryRaw<OutgoingLinkRow[]>`
    SELECT
      l.id,
      l.source_note_id,
      l.target_note_id,
      l.target_path,
      l.link_text,
      l.link_type,
      n.title AS target_title
    FROM "note_links" l
    LEFT JOIN "notes" n ON n.id = l.target_note_id
    WHERE l.source_note_id = ${noteId}::uuid
    ORDER BY l.created_at DESC;
  `

  const incoming = await prisma.$queryRaw<IncomingLinkRow[]>`
    SELECT
      l.id,
      l.source_note_id,
      s.path AS source_path,
      s.title AS source_title,
      l.link_type,
      l.link_text
    FROM "note_links" l
    INNER JOIN "notes" s ON s.id = l.source_note_id
    WHERE l.target_note_id = ${noteId}::uuid
    ORDER BY l.created_at DESC;
  `

  return NextResponse.json({
    outgoing,
    incoming
  })
}
