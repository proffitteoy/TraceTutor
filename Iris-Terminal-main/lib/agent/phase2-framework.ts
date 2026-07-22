import {
  type Phase2ExecutionState,
  type Phase2FrameworkResult,
  type Phase2RunConfig,
  type Phase2StageTrace,
  type WorkspaceContextSnapshot
} from "@/lib/agent/phase2/contracts"
import { runPhase2StagePipeline } from "@/lib/agent/phase2/pipeline"
import { runAnalyzeStage } from "@/lib/agent/phase2/stages/analyze-stage"
import { runCiteStage } from "@/lib/agent/phase2/stages/cite-stage"
import { runComposeStage } from "@/lib/agent/phase2/stages/compose-stage"
import { runLogStage } from "@/lib/agent/phase2/stages/log-stage"
import { runRetrieveStage } from "@/lib/agent/phase2/stages/retrieve-stage"
import type { ChatMode } from "@/lib/knowledge/types"
import { prisma } from "@/lib/prisma"

interface ResolveWorkspaceContextInput {
  workspaceId: string
  fallbackName: string
  fallbackInstruction?: string
}

export const resolveWorkspaceContext = async ({
  workspaceId,
  fallbackName,
  fallbackInstruction = ""
}: ResolveWorkspaceContextInput): Promise<WorkspaceContextSnapshot> => {
  const row = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      instructions: true
    }
  })

  if (!row) {
    return {
      id: workspaceId,
      name: fallbackName,
      instructions: fallbackInstruction
    }
  }

  return row
}

export const normalizeKnowledgeMode = (value: unknown): ChatMode => {
  if (value === "chat_only" || value === "grounded" || value === "auto") {
    return value
  }
  return "auto"
}

export type Phase2FrameworkTrace = Phase2StageTrace

export const runPhase2Framework = async ({
  query,
  mode,
  workspaceId,
  workspaceName,
  workspaceInstruction = "",
  topK,
  chatId = null,
  messageId = null,
  tokenBudget,
  shouldLogEvent = true
}: Phase2RunConfig): Promise<Phase2FrameworkResult> => {
  const trace: Phase2FrameworkTrace[] = []
  const state: Phase2ExecutionState = {
    candidates: [],
    citations: []
  }

  await runPhase2StagePipeline(
    {
      config: {
        query,
        mode,
        workspaceId,
        workspaceName,
        workspaceInstruction,
        topK,
        chatId,
        messageId,
        tokenBudget,
        shouldLogEvent
      },
      state,
      trace
    },
    {
      analyze: runAnalyzeStage,
      retrieve: runRetrieveStage,
      compose: runComposeStage,
      cite: runCiteStage,
      log: runLogStage
    }
  )

  if (!state.analysis) {
    throw new Error("Phase2 framework 执行失败：analysis 缺失")
  }
  if (!state.contextPacket) {
    throw new Error("Phase2 framework 执行失败：contextPacket 缺失")
  }

  return {
    analysis: state.analysis,
    candidates: state.candidates,
    contextPacket: state.contextPacket,
    citations: state.citations,
    trace
  }
}
