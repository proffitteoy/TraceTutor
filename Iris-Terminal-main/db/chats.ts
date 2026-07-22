import { TablesInsert, TablesUpdate } from "@/types/database"

export const getChatById = async (chatId: string) => {
  const response = await fetch(`/api/local/chats/${chatId}`)
  if (!response.ok) return null
  return await response.json()
}

export const getChatsByWorkspaceId = async (workspaceId: string) => {
  const response = await fetch(`/api/local/chats?workspace_id=${workspaceId}`)

  if (!response.ok) {
    throw new Error("Failed to load chats")
  }

  return await response.json()
}

export const createChat = async (chat: TablesInsert<"chats">) => {
  const response = await fetch("/api/local/chats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(chat)
  })

  if (!response.ok) {
    throw new Error("Failed to create chat")
  }

  return await response.json()
}

export const createChats = async (chats: TablesInsert<"chats">[]) => {
  const created: any[] = []
  for (const chat of chats) {
    created.push(await createChat(chat))
  }
  return created
}

export const updateChat = async (
  chatId: string,
  chat: TablesUpdate<"chats">
) => {
  const response = await fetch(`/api/local/chats/${chatId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(chat)
  })

  if (!response.ok) {
    throw new Error("Failed to update chat")
  }

  return await response.json()
}

export const deleteChat = async (chatId: string) => {
  const response = await fetch(`/api/local/chats/${chatId}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    throw new Error("Failed to delete chat")
  }

  return true
}
