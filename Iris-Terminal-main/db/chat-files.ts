import { TablesInsert } from "@/types/database"

export const getChatFilesByChatId = async (chatId: string) => {
  const response = await fetch(`/api/local/chat-files?chat_id=${chatId}`)

  if (!response.ok) {
    throw new Error("Failed to load chat files")
  }

  return await response.json()
}

export const createChatFile = async (chatFile: TablesInsert<"chat_files">) => {
  const response = await fetch("/api/local/chat-files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(chatFile)
  })

  if (!response.ok) {
    throw new Error("Failed to create chat file")
  }

  return await response.json()
}

export const createChatFiles = async (
  chatFiles: TablesInsert<"chat_files">[]
) => {
  const response = await fetch("/api/local/chat-files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(chatFiles)
  })

  if (!response.ok) {
    throw new Error("Failed to create chat files")
  }

  return await response.json()
}
