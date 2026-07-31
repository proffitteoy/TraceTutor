import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { getEnvironmentKeyMap } from "@/lib/server/env-key-map"
import { StartupErrorPayload, StartupPayload } from "@/types"
import { NextResponse } from "next/server"

const isMigrationRequiredError = (error: unknown) => {
  const code = (error as { code?: string })?.code
  return code === "P2021" || code === "P2022"
}

export async function GET(request: Request) {
  try {
    const { user, profile, workspace: defaultWorkspace } =
      await ensureLocalBootstrap()
    const requestedWorkspaceId = new URL(request.url).searchParams.get(
      "workspace_id"
    )

    const workspaces = await prisma.workspace.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: "desc" }
    })
    const workspace =
      workspaces.find(item => item.id === requestedWorkspaceId) ||
      workspaces.find(item => item.id === defaultWorkspace.id) ||
      defaultWorkspace
    const chats = await prisma.chat.findMany({
      where: {
        workspace_id: workspace.id,
        card_relation: "root"
      },
      orderBy: { created_at: "desc" }
    })

    const payload: StartupPayload = {
      profile,
      workspaces: workspaces.length > 0 ? workspaces : [workspace],
      workspace,
      chats,
      envKeyMap: getEnvironmentKeyMap()
    }

    return NextResponse.json(payload)
  } catch (error) {
    const migrationRequired = isMigrationRequiredError(error)
    const payload: StartupErrorPayload = {
      code: migrationRequired ? "MIGRATION_REQUIRED" : "STARTUP_FAILED",
      message: migrationRequired
        ? "数据库结构尚未就绪，请运行 start-manor.bat --migrate。"
        : (error as Error)?.message || "本地启动数据加载失败。"
    }

    return NextResponse.json(payload, {
      status: migrationRequired ? 409 : 500
    })
  }
}
