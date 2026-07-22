import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { RetrievalCandidate } from "./types"

interface GraphExpandInput {
  candidates: RetrievalCandidate[]
  extraNotes?: number
  extraChunks?: number
}

interface LinkRow {
  source_note_id: string
  target_note_id: string | null
}

interface RelatedChunkRow {
  chunk_id: string
  note_id: string
  vault_id: string
  path: string
  title: string
  content: string
  heading_path: string[]
  start_line: number | null
  end_line: number | null
  updated_at: Date
}

const recencyScore = (updatedAt: Date) => {
  const days =
    (Date.now() - updatedAt.getTime()) / (1000 /* s */ * 60 /* m */ * 60 * 24)
  return 1 / (1 + Math.max(0, days))
}

export const expandByNoteGraph = async ({
  candidates,
  extraNotes = 5,
  extraChunks = 8
}: GraphExpandInput): Promise<RetrievalCandidate[]> => {
  if (candidates.length === 0) return []

  const seedNoteIds = Array.from(new Set(candidates.map(item => item.note_id)))
  const seedSqlList = Prisma.join(seedNoteIds.map(id => Prisma.sql`${id}::uuid`))

  const links = await prisma.$queryRaw<LinkRow[]>(Prisma.sql`
    SELECT "source_note_id", "target_note_id"
    FROM "note_links"
    WHERE "source_note_id" IN (${seedSqlList})
       OR "target_note_id" IN (${seedSqlList});
  `)

  const relatedNoteIds = new Set<string>()
  for (const link of links) {
    if (relatedNoteIds.size >= extraNotes) break

    if (link.target_note_id && !seedNoteIds.includes(link.target_note_id)) {
      relatedNoteIds.add(link.target_note_id)
    }

    if (!seedNoteIds.includes(link.source_note_id)) {
      relatedNoteIds.add(link.source_note_id)
    }
  }

  if (relatedNoteIds.size === 0) return candidates

  const relatedSqlList = Prisma.join(
    Array.from(relatedNoteIds).map(id => Prisma.sql`${id}::uuid`)
  )

  const rows = await prisma.$queryRaw<RelatedChunkRow[]>(Prisma.sql`
    SELECT
      nc.id AS chunk_id,
      n.id AS note_id,
      n.vault_id AS vault_id,
      n.path AS path,
      n.title AS title,
      nc.content AS content,
      nc.heading_path AS heading_path,
      nc.start_line AS start_line,
      nc.end_line AS end_line,
      n.updated_at AS updated_at
    FROM "note_chunks" nc
    INNER JOIN "notes" n ON n.id = nc.note_id
    WHERE n.status = 'active'
      AND n.id IN (${relatedSqlList})
    ORDER BY n.updated_at DESC
    LIMIT ${extraChunks};
  `)

  const graphCandidates = rows.map(row => {
    const graph = 1
    const recency = recencyScore(new Date(row.updated_at))
    const fulltext = 0
    const vector = 0
    const finalScore = 0.45 * vector + 0.3 * fulltext + 0.15 * graph + 0.1 * recency

    return {
      chunk_id: row.chunk_id,
      note_id: row.note_id,
      vault_id: row.vault_id,
      path: row.path,
      title: row.title,
      content: row.content,
      heading_path: row.heading_path ?? [],
      start_line: row.start_line,
      end_line: row.end_line,
      updated_at: new Date(row.updated_at).toISOString(),
      vector_score: vector,
      fulltext_score: fulltext,
      graph_score: graph,
      recency_score: recency,
      final_score: finalScore
    } satisfies RetrievalCandidate
  })

  return [...candidates, ...graphCandidates]
}
