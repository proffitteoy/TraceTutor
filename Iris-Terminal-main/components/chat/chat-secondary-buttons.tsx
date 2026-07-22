import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { updateChat } from "@/db/chats"
import {
  IconCircleCheck,
  IconInfoCircle,
  IconMessagePlus,
  IconBooks,
  IconPlayerPause,
  IconPlayerPlay
} from "@tabler/icons-react"
import { FC, useContext, useState } from "react"
import { toast } from "sonner"
import { WithTooltip } from "../ui/with-tooltip"
import { ChatHistorySearch } from "./chat-history-search"
import { useParams, useRouter } from "next/navigation"

interface ChatSecondaryButtonsProps {}

export const ChatSecondaryButtons: FC<ChatSecondaryButtonsProps> = ({}) => {
  const { selectedChat, setSelectedChat, setChats } =
    useContext(ChatbotUIContext)

  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string
  const { handleNewChat } = useChatHandler()
  const [isUpdating, setIsUpdating] = useState(false)

  const chatStatus = selectedChat?.status || "active"
  const promptText = (selectedChat?.prompt || "").trim()
  const promptPreview =
    promptText.length > 80
      ? `${promptText.slice(0, 80).replace(/\s+/g, " ")}...`
      : promptText.replace(/\s+/g, " ")

  const updateChatStatus = async (status: "active" | "suspended" | "ended") => {
    if (!selectedChat) return
    setIsUpdating(true)

    try {
      const updatedChat = await updateChat(selectedChat.id, {
        status,
        updated_at: new Date().toISOString()
      })

      setSelectedChat(updatedChat)
      setChats(prev =>
        prev.map(chat => (chat.id === updatedChat.id ? updatedChat : chat))
      )

      return updatedChat
    } finally {
      setIsUpdating(false)
    }
  }

  const handleToggleSuspend = async () => {
    if (!selectedChat) return
    const nextStatus = chatStatus === "suspended" ? "active" : "suspended"
    try {
      await updateChatStatus(nextStatus)
      toast.success(nextStatus === "suspended" ? "对话已挂起" : "对话已恢复")
    } catch (error: any) {
      toast.error(error.message || "状态更新失败")
    }
  }

  const handleEndChat = async () => {
    if (!selectedChat) return

    try {
      if (chatStatus !== "ended") {
        await updateChatStatus("ended")
      }
    } catch (error: any) {
      toast.error(error.message || "结束对话失败")
      return
    }

    try {
      const response = await fetch("/api/summaries/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ chatId: selectedChat.id })
      })

      let payload: any = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (!response.ok) {
        throw new Error(
          payload?.message || `生成总结失败（${response.status}）`
        )
      }

      if (payload?.skipped) {
        toast.info(payload?.message || "对话较短或较简单，未纳入总结。")
        return
      }

      toast.success("对话已结束，摘要已写入总结栏")
    } catch (error: any) {
      toast.error(error.message || "生成总结失败")
    }
  }

  const handleOpenMemories = () => {
    if (!selectedChat) return
    router.push(`/${locale}/${selectedChat.workspace_id}/memories`)
  }

  return (
    <>
      {selectedChat && (
        <>
          <WithTooltip
            delayDuration={200}
            display={
              <div>
                <div className="text-xl font-bold">对话信息</div>

                <div className="mx-auto mt-2 max-w-xs space-y-2 sm:max-w-sm md:max-w-md lg:max-w-lg">
                  <div>模型：{selectedChat.model}</div>
                  {promptText ? (
                    <>
                      <div>提示词：已隐藏（{promptText.length} 字）</div>
                      <div className="text-muted-foreground text-xs">
                        预览：{promptPreview}
                      </div>
                    </>
                  ) : (
                    <div>提示词：未设置</div>
                  )}

                  <div>温度：{selectedChat.temperature}</div>
                  <div>上下文长度：{selectedChat.context_length}</div>

                  <div>
                    个人资料上下文：
                    {selectedChat.include_profile_context ? "已启用" : "已禁用"}
                  </div>
                  <div>
                    工作区指令：
                    {selectedChat.include_workspace_instructions
                      ? "已启用"
                      : "已禁用"}
                  </div>

                  <div>向量提供方：{selectedChat.embeddings_provider}</div>
                </div>
              </div>
            }
            trigger={
              <div className="mt-1">
                <IconInfoCircle
                  className="cursor-default hover:opacity-50"
                  size={24}
                />
              </div>
            }
          />

          <WithTooltip
            delayDuration={200}
            display={<div>开始新对话</div>}
            trigger={
              <div className="mt-1">
                <IconMessagePlus
                  className="cursor-pointer hover:opacity-50"
                  size={24}
                  onClick={handleNewChat}
                />
              </div>
            }
          />

          <WithTooltip
            delayDuration={200}
            display={<div>记忆与总结</div>}
            trigger={
              <div className="mt-1">
                <IconBooks
                  className="cursor-pointer hover:opacity-50"
                  size={24}
                  onClick={handleOpenMemories}
                />
              </div>
            }
          />

          <div className="mt-0.5">
            <ChatHistorySearch />
          </div>

          <WithTooltip
            delayDuration={200}
            display={
              <div>{chatStatus === "suspended" ? "恢复对话" : "挂起对话"}</div>
            }
            trigger={
              <div className="mt-1">
                {chatStatus === "suspended" ? (
                  <IconPlayerPlay
                    className={`cursor-pointer hover:opacity-50 ${isUpdating ? "opacity-50" : ""}`}
                    size={24}
                    onClick={handleToggleSuspend}
                  />
                ) : (
                  <IconPlayerPause
                    className={`cursor-pointer hover:opacity-50 ${isUpdating ? "opacity-50" : ""}`}
                    size={24}
                    onClick={handleToggleSuspend}
                  />
                )}
              </div>
            }
          />

          <WithTooltip
            delayDuration={200}
            display={
              <div>{chatStatus === "ended" ? "重新生成总结" : "结束对话"}</div>
            }
            trigger={
              <div className="mt-1">
                <IconCircleCheck
                  className={`cursor-pointer hover:opacity-50 ${isUpdating ? "opacity-50" : ""}`}
                  size={24}
                  onClick={handleEndChat}
                />
              </div>
            }
          />
        </>
      )}
    </>
  )
}
