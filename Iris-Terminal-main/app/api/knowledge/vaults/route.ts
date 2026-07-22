import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { resolveVaultPath } from "@/lib/obsidian/vault-path"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

interface VaultRow {
  id: string
  workspace_id: string | null
  name: string
  root_path: string
  status: string
  created_at: Date
  updated_at: Date
}

export async function GET(request: Request) {
  const { workspace } = await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspace_id") ?? workspace.id

  const vaults = await prisma.$queryRaw<VaultRow[]>`
    SELECT
      "id",
      "workspace_id",
      "name",
      "root_path",
      "status",
      "created_at",
      "updated_at"
    FROM "vaults"
    WHERE "workspace_id" = ${workspaceId}::uuid
    ORDER BY "updated_at" DESC;
  `

  return NextResponse.json(vaults)
}

export async function POST(request: Request) {
  const { workspace } = await ensureLocalBootstrap()
  const json = (await request.json()) as {
    id?: string
    name?: string
    root_path?: string
    workspace_id?: string
  }

  if (!json.name?.trim() || !json.root_path?.trim()) {
    return NextResponse.json(
      { message: "name 与 root_path 为必填" },
      { status: 400 }
    )
  }

  try {
    const normalizedPath = await resolveVaultPath(json.root_path)
    const workspaceId = json.workspace_id ?? workspace.id

    const rows = await prisma.$queryRaw<VaultRow[]>`
      INSERT INTO "vaults" (
        "id",
        "workspace_id",
        "name",
        "root_path",
        "status",
        "created_at",
        "updated_at"
      )
      VALUES (
        COALESCE(${json.id}::uuid, gen_random_uuid()),
        ${workspaceId}::uuid,
        ${json.name.trim()},
        ${normalizedPath},
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("workspace_id", "name")
      DO UPDATE SET
        "root_path" = EXCLUDED."root_path",
        "status" = 'active',
        "updated_at" = CURRENT_TIMESTAMP
      RETURNING
        "id",
        "workspace_id",
        "name",
        "root_path",
        "status",
        "created_at",
        "updated_at";
    `

    return NextResponse.json(rows[0])
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "注册 Vault 失败" },
      { status: 400 }
    )
  }
}
