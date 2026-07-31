import { ChatTreeResponse, CreateCardRequest, UpdateCardRequest } from "@/types"

export const getChatTree = async (treeId: string) => {
  const response = await fetch(`/api/local/chat-trees/${treeId}`)
  if (!response.ok) throw new Error("Failed to load chat tree")
  return (await response.json()) as ChatTreeResponse
}

export const createChatTreeCard = async (
  treeId: string,
  input: CreateCardRequest
) => {
  const response = await fetch(`/api/local/chat-trees/${treeId}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  })

  if (!response.ok) throw new Error("Failed to create card")
  return await response.json()
}

export const updateChatTreeCard = async (
  treeId: string,
  cardId: string,
  input: UpdateCardRequest
) => {
  const response = await fetch(
    `/api/local/chat-trees/${treeId}/cards/${cardId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  )

  if (!response.ok) throw new Error("Failed to update card")
  return await response.json()
}

export const deleteChatTreeCard = async (
  treeId: string,
  cardId: string,
  confirmSubtree = false
) => {
  const response = await fetch(
    `/api/local/chat-trees/${treeId}/cards/${cardId}?confirm_subtree=${confirmSubtree}`,
    { method: "DELETE" }
  )

  if (response.status === 409) {
    return { requiresSubtreeConfirmation: true, ...(await response.json()) }
  }

  if (!response.ok) throw new Error("Failed to delete card")
  return { ok: true }
}
