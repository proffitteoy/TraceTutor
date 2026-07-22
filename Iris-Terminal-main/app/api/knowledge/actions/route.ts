import {
  type NoteActionType,
  buildObsidianDraftMarkdown
} from "@/lib/agent/note-action-planner"
import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { writeDraftToObsidian } from "@/lib/obsidian/draft-writer"
import { resolveVaultPath } from "@/lib/obsidian/vault-path"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

interface VaultRow {
  id: string
  name: string
  root_path: string
}

const isSupportedAction = (value: unknown): value is NoteActionType =>
  [
    "chat_summary",
    "concept_note",
    "literature_note",
    "project_decision_record",
    "experiment_log"
  ].includes(String(value))

export async function POST(request: Request) {
  const { workspace } = await ensureLocalBootstrap()
  const json = (await request.json()) as {
    action_type?: NoteActionType
    vault_id?: string
    title?: string
    content?: string
    related?: string[]
    sources?: Array<{ title: string; path: string }>
  }

  if (!json.vault_id || !json.title?.trim() || !json.content?.trim()) {
    return NextResponse.json(
      { message: "vault_id、title、content 为必填" },
      { status: 400 }
    )
  }

  if (!isSupportedAction(json.action_type)) {
    return NextResponse.json({ message: "action_type 不合法" }, { status: 400 })
  }

  const rows = await prisma.$queryRaw<VaultRow[]>`
    SELECT "id", "name", "root_path"
    FROM "vaults"
    WHERE "id" = ${json.vault_id}::uuid
      AND "status" = 'active'
    LIMIT 1;
  `
  const vault = rows[0]
  if (!vault) {
    return NextResponse.json({ message: "Vault 不存在" }, { status: 404 })
  }

  try {
    const vaultRoot = await resolveVaultPath(vault.root_path)
    const markdown = buildObsidianDraftMarkdown({
      type: json.action_type,
      title: json.title.trim(),
      content: json.content.trim(),
      workspace: workspace.name,
      related: json.related ?? [],
      createdDate: new Date().toISOString().slice(0, 10),
      sources: json.sources ?? []
    })

    const result = await writeDraftToObsidian({
      vaultRoot,
      vaultName: vault.name,
      title: json.title,
      markdown
    })

    return NextResponse.json({
      action_type: json.action_type,
      ...result
    })
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "写回 Obsidian 草稿失败" },
      { status: 500 }
    )
  }
}
