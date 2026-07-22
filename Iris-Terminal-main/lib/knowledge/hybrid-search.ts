import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { RetrievalCandidate } from "./types"

interface HybridSearchInput {
  query: string
  workspaceId?: string
  topK?: number
}

interface RawChunkRow {
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
  fulltext_score: number | null
}

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim()

const lexicalBoost = (query: string, content: string) => {
  const q = normalizeText(query)
  const c = normalizeText(content)
  if (!q || !c) return 0
  if (c.includes(q)) return 1

  const parts = q
    .split(/[\s,.;:!?，。；：！？、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
  if (parts.length === 0) return 0

  const hit = parts.filter(item => c.includes(item)).length
  return hit / parts.length
}

const recencyScore = (updatedAt: Date) => {
  const days =
    (Date.now() - updatedAt.getTime()) / (1000 /* s */ * 60 /* m */ * 60 * 24)
  return 1 / (1 + Math.max(0, days))
}

export const hybridSearch = async ({
  query,
  workspaceId,
  topK = 8
}: HybridSearchInput): Promise<RetrievalCandidate[]> => {
  const candidateLimit = Math.max(20, topK * 4)
  const workspaceFilter = workspaceId
    ? Prisma.sql`AND v.workspace_id = ${workspaceId}::uuid`
    : Prisma.empty

  const rows = await prisma.$queryRaw<RawChunkRow[]>(Prisma.sql`
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
      n.updated_at AS updated_at,
      ts_rank(to_tsvector('simple', nc.content), plainto_tsquery('simple', ${query})) AS fulltext_score
    FROM "note_chunks" nc
    INNER JOIN "notes" n ON n.id = nc.note_id
    INNER JOIN "vaults" v ON v.id = n.vault_id
    WHERE n.status = 'active'
      ${workspaceFilter}
    ORDER BY fulltext_score DESC NULLS LAST, n.updated_at DESC
    LIMIT ${candidateLimit};
  `)

  if (rows.length === 0) return []

  const maxFts = Math.max(
    ...rows.map(row => (row.fulltext_score && row.fulltext_score > 0 ? row.fulltext_score : 0)),
    1e-6
  )

  const scored = rows.map(row => {
    const fts = row.fulltext_score && row.fulltext_score > 0 ? row.fulltext_score : 0
    const fulltext = fts / maxFts
    const lexical = lexicalBoost(query, row.content)
    const recency = recencyScore(new Date(row.updated_at))
    const vector = 0
    const graph = 0
    const finalScore =
      0.45 * vector + 0.3 * fulltext + 0.15 * graph + 0.1 * recency + 0.2 * lexical

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

  return scored.sort((a, b) => b.final_score - a.final_score).slice(0, topK)
}
