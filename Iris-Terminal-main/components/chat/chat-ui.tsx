import Loading from "@/app/[locale]/loading"
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { getAssistantToolsByAssistantId } from "@/db/assistant-tools"
import { getChatFilesByChatId } from "@/db/chat-files"
import { getChatById } from "@/db/chats"
import { getMessageFileItemsByMessageId } from "@/db/message-file-items"
import { getMessagesByChatId } from "@/db/messages"
import { getMessageImageFromStorage } from "@/db/storage/message-images"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import useHotkey from "@/lib/hooks/use-hotkey"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"
import { cn } from "@/lib/utils"
import { LLMID, MessageImage } from "@/types"
import { Tables } from "@/types/database"
import { IconLoader2 } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { FC, useCallback, useContext, useEffect, useState } from "react"
import { Badge } from "../ui/badge"
import { useScroll } from "./chat-hooks/use-scroll"
import { ChatInput } from "./chat-input"
import { ChatMessages } from "./chat-messages"
import { ChatScrollButtons } from "./chat-scroll-buttons"
import { ChatSecondaryButtons } from "./chat-secondary-buttons"

interface ChatUIProps {
  chatIdOverride?: string
  embedded?: boolean
  translucent?: boolean
  onBranchFromMessage?: (message: Tables<"messages">) => void
}

export const ChatUI: FC<ChatUIProps> = ({
  chatIdOverride,
  embedded = false,
  translucent = false,
  onBranchFromMessage
}) => {
  useHotkey("o", () => handleNewChat())

  const params = useParams()
  const chatId = chatIdOverride || (params.chatid as string | undefined)

  const {
    setChatMessages,
    selectedChat,
    setSelectedChat,
    setChatSettings,
    setChatImages,
    assistants,
    setSelectedAssistant,
    setChatFileItems,
    setChatFiles,
    setShowFilesDisplay,
    setUseRetrieval,
    setSelectedTools,
    isGenerating,
    firstTokenReceived,
    toolInUse
  } = useContext(ChatbotUIContext)

  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const {
    messagesStartRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    setIsAtBottom,
    isAtTop,
    isAtBottom,
    isOverflowing,
    scrollToTop
  } = useScroll()

  const [loading, setLoading] = useState(true)
  const [generationSeconds, setGenerationSeconds] = useState(0)

  useEffect(() => {
    if (!isGenerating) {
      setGenerationSeconds(0)
      return
    }

    const startedAt = Date.now()
    const updateElapsed = () => {
      setGenerationSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      )
    }

    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [isGenerating])

  const fetchMessages = useCallback(
    async (currentChatId: string) => {
      const fetchedMessages = (await getMessagesByChatId(
        currentChatId
      )) as any[]

      const imagePromises: Promise<MessageImage>[] = fetchedMessages.flatMap(
        (message: any) =>
          message.image_paths
            ? message.image_paths.map(async (imagePath: string) => {
                const url = await getMessageImageFromStorage(imagePath)

                if (url) {
                  const response = await fetch(url)
                  const blob = await response.blob()
                  const base64 = await convertBlobToBase64(blob)

                  return {
                    messageId: message.id,
                    path: imagePath,
                    base64,
                    url,
                    file: null
                  }
                }

                return {
                  messageId: message.id,
                  path: imagePath,
                  base64: "",
                  url,
                  file: null
                }
              })
            : []
      )

      const images: MessageImage[] = await Promise.all(imagePromises.flat())
      setChatImages(images)

      const messageFileItemPromises = fetchedMessages.map(
        async (message: any) => await getMessageFileItemsByMessageId(message.id)
      )

      const messageFileItems = await Promise.all(messageFileItemPromises)

      const uniqueFileItems = messageFileItems.flatMap(item => item.file_items)
      setChatFileItems(uniqueFileItems)

      const chatFiles = await getChatFilesByChatId(currentChatId)

      setChatFiles(
        chatFiles.files.map((file: any) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          file: null
        }))
      )

      setUseRetrieval(true)
      setShowFilesDisplay(true)

      const fetchedChatMessages = fetchedMessages.map((message: any) => {
        return {
          message,
          fileItems: messageFileItems
            .filter(messageFileItem => messageFileItem.id === message.id)
            .flatMap(messageFileItem =>
              messageFileItem.file_items.map((fileItem: any) => fileItem.id)
            )
        }
      })

      setChatMessages(fetchedChatMessages)
    },
    [
      setChatImages,
      setChatFileItems,
      setChatFiles,
      setUseRetrieval,
      setShowFilesDisplay,
      setChatMessages
    ]
  )

  const fetchChat = useCallback(
    async (currentChatId: string) => {
      const chat = await getChatById(currentChatId)
      if (!chat) return

      if (chat.assistant_id) {
        const assistant = assistants.find(
          assistant => assistant.id === chat.assistant_id
        )

        if (assistant) {
          setSelectedAssistant(assistant)

          const assistantTools = (
            await getAssistantToolsByAssistantId(assistant.id)
          ).tools
          setSelectedTools(assistantTools)
        }
      }

      setSelectedChat(chat)
      setChatSettings({
        model: chat.model as LLMID,
        prompt: UNIFIED_SYSTEM_PROMPT,
        temperature: chat.temperature,
        contextLength: chat.context_length,
        includeProfileContext: chat.include_profile_context,
        includeWorkspaceInstructions: chat.include_workspace_instructions,
        embeddingsProvider: chat.embeddings_provider as "openai" | "local"
      })
    },
    [
      assistants,
      setSelectedAssistant,
      setSelectedTools,
      setSelectedChat,
      setChatSettings
    ]
  )

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)

      if (!chatId) {
        setLoading(false)
        return
      }

      await fetchMessages(chatId)
      await fetchChat(chatId)
      if (cancelled) return

      scrollToBottom()
      setIsAtBottom(true)
      handleFocusChatInput()
      setLoading(false)
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [
    chatId,
    fetchMessages,
    fetchChat,
    scrollToBottom,
    setIsAtBottom,
    handleFocusChatInput
  ])

  if (loading) {
    return <Loading />
  }

  const generationLabel =
    toolInUse === "retrieval"
      ? "正在检索相关资料"
      : toolInUse !== "none"
        ? `正在使用 ${toolInUse}`
        : firstTokenReceived
          ? "正在生成回答"
          : "正在等待模型响应"

  return (
    <div
      className={
        embedded
          ? "relative flex h-full min-h-0 flex-col items-center"
          : "relative flex h-full flex-col items-center"
      }
    >
      <div className="absolute left-4 top-2.5 flex justify-center">
        <ChatScrollButtons
          isAtTop={isAtTop}
          isAtBottom={isAtBottom}
          isOverflowing={isOverflowing}
          scrollToTop={scrollToTop}
          scrollToBottom={scrollToBottom}
        />
      </div>

      <div className="absolute right-4 top-1 flex h-[40px] items-center space-x-2">
        <ChatSecondaryButtons />
      </div>

      {selectedChat?.status === "suspended" && (
        <div className="flex h-9 w-full items-center justify-center border-b border-amber-500/30 bg-amber-500/10">
          <Badge variant="secondary" className="border border-amber-500/40">
            当前对话已挂起
          </Badge>
        </div>
      )}

      {selectedChat?.status === "ended" && (
        <div className="bg-muted flex h-9 w-full items-center justify-center border-b">
          <Badge variant="secondary">当前对话已结束</Badge>
        </div>
      )}

      {!embedded && (
        <div className="bg-secondary flex max-h-[50px] min-h-[50px] w-full items-center justify-center border-b-2 font-bold">
          <div className="max-w-[200px] truncate sm:max-w-[400px] md:max-w-[500px] lg:max-w-[600px] xl:max-w-[700px]">
            {selectedChat?.name || "对话"}
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex size-full flex-col overflow-auto border-b",
          translucent && "bg-background/60"
        )}
        onScroll={handleScroll}
      >
        <div ref={messagesStartRef} />

        <ChatMessages onBranchFromMessage={onBranchFromMessage} />

        <div ref={messagesEndRef} />
      </div>

      {isGenerating && (
        <div
          className="border-border bg-primary/5 flex w-full shrink-0 items-center justify-center gap-2 border-t px-4 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <IconLoader2 className="text-primary animate-spin" size={16} />
          <span className="font-medium">{generationLabel}</span>
          <span className="text-muted-foreground tabular-nums">
            {generationSeconds}s
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            {firstTokenReceived ? "内容会持续出现" : "可随时点击停止"}
          </span>
        </div>
      )}

      <div
        className={cn(
          embedded
            ? "relative w-full min-w-[300px] items-end px-3 pb-3 pt-2"
            : "relative w-full min-w-[300px] items-end px-2 pb-3 pt-0 sm:w-[600px] sm:pb-8 sm:pt-5 md:w-[700px] lg:w-[700px] xl:w-[800px]",
          translucent && "bg-background=60"
        )}
      >
        <ChatInput />
      </div>
    </div>
  )
}
