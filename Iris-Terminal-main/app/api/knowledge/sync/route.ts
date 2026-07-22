import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { syncVaultNotes } from "@/lib/knowledge/note-indexer"
import { scanVaultMarkdownFiles } from "@/lib/knowledge/vault-scanner"
import { resolveVaultPath } from "@/lib/obsidian/vault-path"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

interface VaultRow {
  id: string
  workspace_id: string | null
  name: string
  root_path: string
  status: string
}

export async function POST(request: Request) {
  await ensureLocalBootstrap()
  const json = (await request.json()) as { vault_id?: string }

  if (!json.vault_id) {
    return NextResponse.json({ message: "vault_id 为必填" }, { status: 400 })
  }

  const vaultRows = await prisma.$queryRaw<VaultRow[]>`
    SELECT "id", "workspace_id", "name", "root_path", "status"
    FROM "vaults"
    WHERE "id" = ${json.vault_id}::uuid
      AND "status" = 'active'
    LIMIT 1;
  `

  const vault = vaultRows[0]
  if (!vault) {
    return NextResponse.json({ message: "Vault 不存在或已停用" }, { status: 404 })
  }

  try {
    const vaultRoot = await resolveVaultPath(vault.root_path)
    const files = await scanVaultMarkdownFiles(vaultRoot)
    const stats = await syncVaultNotes(vault.id, files)

    return NextResponse.json({
      vault_id: vault.id,
      vault_name: vault.name,
      stats
    })
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Vault 同步失败" },
      { status: 500 }
    )
  }
}
