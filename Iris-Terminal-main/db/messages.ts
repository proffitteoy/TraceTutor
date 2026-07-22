import { TablesInsert, TablesUpdate } from "@/types/database"

export const getMessageById = async (messageId: string) => {
  const response = await fetch(`/api/local/messages/${messageId}`)
  if (!response.ok) {
    throw new Error("Message not found")
  }
  return await response.json()
}

export const getMessagesByChatId = async (chatId: string) => {
  const response = await fetch(`/api/local/messages?chat_id=${chatId}`)
  if (!response.ok) {
    throw new Error("Messages not found")
  }
  return await response.json()
}

export const createMessage = async (message: TablesInsert<"messages">) => {
  const response = await fetch("/api/local/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  })

  if (!response.ok) {
    throw new Error("Failed to create message")
  }

  const created = await response.json()
  return Array.isArray(created) ? created[0] : created
}

export const createMessages = async (messages: TablesInsert<"messages">[]) => {
  const response = await fetch("/api/local/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messages)
  })

  if (!response.ok) {
    throw new Error("Failed to create messages")
  }

  return await response.json()
}

export const updateMessage = async (
  messageId: string,
  message: TablesUpdate<"messages">
) => {
  const response = await fetch(`/api/local/messages/${messageId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  })

  if (!response.ok) {
    throw new Error("Failed to update message")
  }

  return await response.json()
}

export const deleteMessage = async (messageId: string) => {
  return true
}

export async function deleteMessagesIncludingAndAfter(
  userId: string,
  chatId: string,
  sequenceNumber: number
) {
  const response = await fetch("/api/local/messages/delete-from", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      sequence_number: sequenceNumber
    })
  })

  if (!response.ok) {
    return {
      error: "Failed to delete messages."
    }
  }

  return true
}
