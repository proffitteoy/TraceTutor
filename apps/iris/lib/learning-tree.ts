import type { LearningResponse } from "@/lib/contracts"

export type CardRelation = "root" | "child" | "divergent" | "branch"

export interface ConversationEntry {
  id: string
  role: "user" | "assistant"
  text: string
  response?: LearningResponse
  sourceUserText?: string
  sourceQuestionId?: string | null
}

export interface LearningTreeBranch {
  id: string
  name: string
  relation: CardRelation
  parentId: string | null
  sourceMessageId?: string
  sourceQuote?: string
  selectionStart?: number
  selectionEnd?: number
  x: number
  y: number
  sessionId: string
  activeQuestionId: string | null
  entries: ConversationEntry[]
}

export interface PersistedLearningTree {
  version: 1
  activeBranchId: string
  branches: LearningTreeBranch[]
}

export function getRelationLabel(relation: CardRelation): string {
  switch (relation) {
    case "child":
      return "深入子卡片"
    case "divergent":
      return "同级发散卡片"
    case "branch":
      return "历史分支卡片"
    default:
      return "根卡片"
  }
}

export function isPersistedLearningTree(
  value: unknown
): value is PersistedLearningTree {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<PersistedLearningTree>
  return (
    candidate.version === 1 &&
    typeof candidate.activeBranchId === "string" &&
    Array.isArray(candidate.branches) &&
    candidate.branches.length > 0 &&
    candidate.branches.every(
      branch =>
        branch &&
        typeof branch.id === "string" &&
        typeof branch.name === "string" &&
        ["root", "child", "divergent", "branch"].includes(branch.relation) &&
        Array.isArray(branch.entries)
    )
  )
}
