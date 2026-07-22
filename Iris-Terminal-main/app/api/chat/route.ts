import {
  normalizeKnowledgeMode,
  resolveWorkspaceContext,
  runPhase2Framework
} from "@/lib/agent/phase2-framework"
import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { generateAnswerFromContext } from "@/lib/llm/llm-gateway"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { workspace } = await ensureLocalBootstrap()
  const json = (await request.json()) as {
    query?: string
    mode?: "auto" | "chat_only" | "grounded"
    workspace_id?: string
    chat_id?: string
    message_id?: string
    top_k?: number
  }

  const query = json.query?.trim()
  if (!query) {
    return NextResponse.json({ message: "query 不能为空" }, { status: 400 })
  }

  const mode = normalizeKnowledgeMode(json.mode)
  const workspaceId = json.workspace_id ?? workspace.id
  const workspaceContext = await resolveWorkspaceContext({
    workspaceId,
    fallbackName: workspace.name
  })

  const phase2 = await runPhase2Framework({
    query,
    mode,
    workspaceId,
    workspaceName: workspaceContext.name,
    workspaceInstruction: workspaceContext.instructions,
    topK: json.top_k,
    chatId: json.chat_id ?? null,
    messageId: json.message_id ?? null
  })

  const answer = await generateAnswerFromContext({
    userQuery: query,
    mode: phase2.analysis.mode,
    context: phase2.contextPacket
  })

  return NextResponse.json({
    mode: phase2.analysis.mode,
    answer,
    analysis: phase2.analysis,
    sources: phase2.contextPacket.sources,
    citations: phase2.citations
  })
}
