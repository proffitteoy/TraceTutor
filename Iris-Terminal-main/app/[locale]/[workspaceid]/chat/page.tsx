"use client"

import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatSettings } from "@/components/chat/chat-settings"
import { ChatUI } from "@/components/chat/chat-ui"
import { Brand } from "@/components/ui/brand"
import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import useHotkey from "@/lib/hooks/use-hotkey"
import { useTheme } from "next-themes"
import { useParams, useRouter } from "next/navigation"
import { useContext, useMemo } from "react"

export default function ChatPage() {
  useHotkey("o", () => handleNewChat())
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const { chatMessages, chats } = useContext(ChatbotUIContext)
  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const { theme } = useTheme()
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string
  const workspaceId = params.workspaceid as string

  const suspendedChats = useMemo(
    () => chats.filter(chat => chat.status === "suspended"),
    [chats]
  )

  const handleOpenSuspendedChat = (chatId: string) => {
    router.push(`/${locale}/${workspaceId}/chat/${chatId}`)
  }

  return (
    <>
      {chatMessages.length === 0 ? (
        <div className="relative flex h-full flex-col items-center justify-center">
          {suspendedChats.length > 0 && (
            <div className="absolute top-14 z-10 flex w-full justify-center px-4">
              <div className="bg-background/85 border-border w-full max-w-4xl rounded-lg border p-2 shadow-sm backdrop-blur">
                <div className="text-muted-foreground mb-2 text-xs">
                  {"\u6302\u8d77\u5bf9\u8bdd"}
                </div>

                <div className="flex flex-wrap gap-2">
                  {suspendedChats.map(chat => (
                    <Button
                      key={chat.id}
                      variant="outline"
                      size="sm"
                      className="max-w-[260px] truncate"
                      onClick={() => handleOpenSuspendedChat(chat.id)}
                    >
                      {chat.name || "\u672a\u547d\u540d\u5bf9\u8bdd"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="top-50% left-50% -translate-x-50% -translate-y-50% absolute mb-20">
            <Brand theme={theme === "dark" ? "dark" : "light"} />
          </div>

          <div className="absolute right-2 top-2">
            <ChatSettings />
          </div>

          <div className="flex grow flex-col items-center justify-center" />

          <div className="w-full min-w-[300px] items-end px-2 pb-3 pt-0 sm:w-[600px] sm:pb-8 sm:pt-5 md:w-[700px] lg:w-[700px] xl:w-[800px]">
            <ChatInput />
          </div>
        </div>
      ) : (
        <ChatUI />
      )}
    </>
  )
}
