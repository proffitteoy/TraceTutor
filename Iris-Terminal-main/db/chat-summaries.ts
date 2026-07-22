import { ChatSummaryDetail } from "@/types"
import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getChatSummariesByWorkspaceId = async (
  workspaceId?: string,
  includeMessages = false,
  limit?: number
) => {
  const query = new URLSearchParams()
  if (workspaceId) query.set("workspace_id", workspaceId)
  if (includeMessages) query.set("include_messages", "true")
  if (limit && Number.isFinite(limit)) query.set("limit", String(limit))

  const suffix = query.toString()
  const response = await fetch(
    `/api/local/chat-summaries${suffix ? `?${suffix}` : ""}`
  )

  if (!response.ok) {
    throw new Error("Failed to fetch chat summaries")
  }

  return (await response.json()) as ChatSummaryDetail[]
}

export const getChatSummaryByChatId = async (
  _chatId: string
): Promise<ChatSummaryDetail> =>
  unsupportedLocalFeature("chat-summaries.getChatSummaryByChatId")

export const createChatSummary = async (
  summary: TablesInsert<"chat_summaries">
): Promise<Tables<"chat_summaries">> =>
  unsupportedLocalFeature("chat-summaries.createChatSummary")

export const upsertChatSummary = async (
  summary: TablesInsert<"chat_summaries">
): Promise<Tables<"chat_summaries">> =>
  unsupportedLocalFeature("chat-summaries.upsertChatSummary")

export const updateChatSummary = async (
  _summaryId: string,
  summary: TablesUpdate<"chat_summaries">
): Promise<Tables<"chat_summaries">> =>
  unsupportedLocalFeature("chat-summaries.updateChatSummary")

export const deleteChatSummary = async (summaryId: string) => {
  const response = await fetch(`/api/local/chat-summaries/${summaryId}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    let message = "Failed to delete summary"
    try {
      const data = (await response.json()) as { message?: string }
      if (data?.message) message = data.message
    } catch {
      // ignore parse failure
    }
    throw new Error(message)
  }

  return true
}
