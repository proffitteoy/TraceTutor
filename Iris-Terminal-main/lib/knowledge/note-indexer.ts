import { Prisma } from "@prisma/client"
import path from "path"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { parseFrontmatter } from "./frontmatter-parser"
import { extractNoteMetadata } from "./link-extractor"
import { parseMarkdownNote } from "./markdown-parser"
import { buildNoteChunks, type NoteChunkRecord } from "./note-chunker"
import { sha256 } from "./hash"
import type { VaultMarkdownFile } from "./vault-scanner"
import type { VaultSyncStats } from "./types"

interface ParsedNoteForIndex {
  path: string
  title: string
  aliases: string[]
  tags: string[]
  frontmatter: Record<string, unknown>
  content_hash: string
  mtime: Date
  chunks: NoteChunkRecord[]
  links: Array<{
    target_path: string
    link_text?: string
    link_type: string
  }>
}

const stripLinkAnchor = (target: string) => target.split("#")[0].split("^")[0]

const resolveLinkPath = (sourcePath: string, rawTarget: string) => {
  const cleaned = stripLinkAnchor(rawTarget).trim().replace(/\\/g, "/")
  if (!cleaned) return ""

  const normalized = cleaned.startsWith("/")
    ? cleaned.slice(1)
    : path
        .normalize(path.join(path.dirname(sourcePath), cleaned))
        .replace(/\\/g, "/")

  if (!normalized) return ""
  if (normalized.toLowerCase().endsWith(".md")) return normalized
  return `${normalized}.md`
}

export const buildParsedNote = (file: VaultMarkdownFile): ParsedNoteForIndex => {
  const { frontmatter, body } = parseFrontmatter(file.content)
  const parsedMarkdown = parseMarkdownNote(body, file.relativePath)
  const extracted = extractNoteMetadata(body, frontmatter)
  const chunks = buildNoteChunks(parsedMarkdown.sections)

  return {
    path: file.relativePath,
    title: parsedMarkdown.title,
    aliases: extracted.aliases,
    tags: extracted.tags,
    frontmatter,
    content_hash: sha256(file.content),
    mtime: file.mtime,
    chunks,
    links: extracted.links
  }
}

const markDeletedNotes = async (vaultId: string, keepPaths: string[]) => {
  let deletedCount = 0
  if (keepPaths.length === 0) {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS "count"
      FROM "notes"
      WHERE "vault_id" = ${vaultId}::uuid
        AND "status" <> 'deleted';
    `
    deletedCount = rows[0]?.count ?? 0

    await prisma.$executeRaw`
      UPDATE "notes"
      SET "status" = 'deleted',
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "vault_id" = ${vaultId}::uuid
        AND "status" <> 'deleted';
    `
    return deletedCount
  }

  const pathList = Prisma.join(keepPaths.map(item => Prisma.sql`${item}`))
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "notes"
    WHERE "vault_id" = ${vaultId}::uuid
      AND "status" <> 'deleted'
      AND "path" NOT IN (${pathList});
  `)
  deletedCount = rows[0]?.count ?? 0

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "notes"
    SET "status" = 'deleted',
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "vault_id" = ${vaultId}::uuid
      AND "status" <> 'deleted'
      AND "path" NOT IN (${pathList});
  `)

  return deletedCount
}

export const syncVaultNotes = async (
  vaultId: string,
  files: VaultMarkdownFile[]
): Promise<VaultSyncStats> => {
  const parsedNotes = files.map(buildParsedNote)

  let updatedNotes = 0
  let chunksWritten = 0
  let linksWritten = 0

  await prisma.$transaction(async tx => {
    for (const note of parsedNotes) {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "notes" (
          "id",
          "vault_id",
          "path",
          "title",
          "aliases",
          "tags",
          "frontmatter",
          "content_hash",
          "mtime",
          "status",
          "created_at",
          "updated_at"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${vaultId}::uuid,
          ${note.path},
          ${note.title},
          ${note.aliases}::text[],
          ${note.tags}::text[],
          ${JSON.stringify(note.frontmatter)}::jsonb,
          ${note.content_hash},
          ${note.mtime},
          'active',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("vault_id", "path")
        DO UPDATE SET
          "title" = EXCLUDED."title",
          "aliases" = EXCLUDED."aliases",
          "tags" = EXCLUDED."tags",
          "frontmatter" = EXCLUDED."frontmatter",
          "content_hash" = EXCLUDED."content_hash",
          "mtime" = EXCLUDED."mtime",
          "status" = 'active',
          "updated_at" = CURRENT_TIMESTAMP
        RETURNING "id";
      `

      const noteId = rows[0]?.id
      if (!noteId) continue

      updatedNotes += 1

      await tx.$executeRaw`
        DELETE FROM "note_chunks"
        WHERE "note_id" = ${noteId}::uuid;
      `
      await tx.$executeRaw`
        DELETE FROM "note_links"
        WHERE "source_note_id" = ${noteId}::uuid;
      `

      for (const chunk of note.chunks) {
        await tx.$executeRaw`
          INSERT INTO "note_chunks" (
            "id",
            "note_id",
            "heading_path",
            "block_id",
            "content",
            "content_hash",
            "token_count",
            "start_line",
            "end_line",
            "created_at",
            "updated_at"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${noteId}::uuid,
            ${chunk.heading_path}::text[],
            ${chunk.block_id},
            ${chunk.content},
            ${chunk.content_hash},
            ${chunk.token_count},
            ${chunk.start_line},
            ${chunk.end_line},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          );
        `
        chunksWritten += 1
      }

      for (const link of note.links) {
        const normalizedTarget = resolveLinkPath(note.path, link.target_path)
        if (!normalizedTarget) continue

        const targetRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "notes"
          WHERE "vault_id" = ${vaultId}::uuid
            AND "path" = ${normalizedTarget}
          LIMIT 1;
        `
        const targetNoteId = targetRows[0]?.id ?? null

        await tx.$executeRaw`
          INSERT INTO "note_links" (
            "id",
            "vault_id",
            "source_note_id",
            "target_note_id",
            "target_path",
            "link_text",
            "link_type",
            "created_at"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${vaultId}::uuid,
            ${noteId}::uuid,
            ${targetNoteId}::uuid,
            ${normalizedTarget},
            ${link.link_text ?? null},
            ${link.link_type},
            CURRENT_TIMESTAMP
          );
        `
        linksWritten += 1
      }
    }
  })

  const deletedNotes = await markDeletedNotes(
    vaultId,
    parsedNotes.map(note => note.path)
  )

  return {
    scanned_notes: parsedNotes.length,
    updated_notes: updatedNotes,
    deleted_notes: deletedNotes,
    chunks_written: chunksWritten,
    links_written: linksWritten
  }
}
