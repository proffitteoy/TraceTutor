import { TablesInsert } from "@/types/database"

export const getMessageFileItemsByMessageId = async (messageId: string) => {
  const response = await fetch(
    `/api/local/message-file-items?message_id=${messageId}`
  )

  if (!response.ok) {
    throw new Error("Failed to load message file items")
  }

  return await response.json()
}

export const createMessageFileItems = async (
  messageFileItems: TablesInsert<"message_file_items">[]
) => {
  const response = await fetch("/api/local/message-file-items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messageFileItems)
  })

  if (!response.ok) {
    throw new Error("Failed to create message file items")
  }

  return await response.json()
}
