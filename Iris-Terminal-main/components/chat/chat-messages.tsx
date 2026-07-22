import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/types/database"
import { FC, useContext, useState } from "react"
import { Message } from "../messages/message"

interface ChatMessagesProps {}

export const ChatMessages: FC<ChatMessagesProps> = ({}) => {
  const { chatMessages, chatFileItems } = useContext(ChatbotUIContext)

  const { handleSendEdit } = useChatHandler()

  const [editingMessage, setEditingMessage] = useState<Tables<"messages">>()
  const sortedMessages = [...chatMessages].sort(
    (a, b) => a.message.sequence_number - b.message.sequence_number
  )

  return sortedMessages.map((chatMessage, index, array) => {
    const messageFileItems = chatFileItems.filter(
      (chatFileItem, _, self) =>
        chatMessage.fileItems.includes(chatFileItem.id) &&
        self.findIndex(item => item.id === chatFileItem.id) === _
    )

    return (
      <Message
        key={chatMessage.message.id}
        message={chatMessage.message}
        fileItems={messageFileItems}
        isEditing={editingMessage?.id === chatMessage.message.id}
        isLast={index === array.length - 1}
        onStartEdit={setEditingMessage}
        onCancelEdit={() => setEditingMessage(undefined)}
        onSubmitEdit={handleSendEdit}
      />
    )
  })
}
