import {
  normalizeKnowledgeMode,
  resolveWorkspaceContext,
  runPhase2Framework
} from "@/lib/agent/phase2-framework"
import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
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

  if (!phase2.analysis.shouldRetrieve) {
    return NextResponse.json({
      analysis: phase2.analysis,
      candidates: [],
      sources: [],
      citations: []
    })
  }

  return NextResponse.json({
    analysis: phase2.analysis,
    candidates: phase2.candidates,
    sources: phase2.contextPacket.sources,
    citations: phase2.citations,
    context_preview: phase2.contextPacket.text
  })
}
