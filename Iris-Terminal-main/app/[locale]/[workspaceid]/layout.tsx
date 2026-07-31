"use client"

import { Dashboard } from "@/components/ui/dashboard"
import { ChatbotUIContext } from "@/context/context"
import {
  DEFAULT_CHAT_CONTEXT_LENGTH,
  DEFAULT_CHAT_TEMPERATURE
} from "@/lib/default-chat-settings"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"
import { LLMID } from "@/types"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  ReactNode,
  useCallback,
  useContext,
  useEffect
} from "react"
import Loading from "../loading"

interface WorkspaceLayoutProps {
  children: ReactNode
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string
  const modelFromQuery = searchParams.get("model")

  const {
    startupStatus,
    startupError,
    selectedWorkspace,
    setChatSettings,
    setSelectedChat,
    setChatMessages,
    setUserInput,
    setIsGenerating,
    setFirstTokenReceived,
    setChatFiles,
    setChatImages,
    setNewMessageFiles,
    setNewMessageImages,
    setShowFilesDisplay
  } = useContext(ChatbotUIContext)

  const resetChatState = useCallback(() => {
    setUserInput("")
    setChatMessages([])
    setSelectedChat(null)
    setIsGenerating(false)
    setFirstTokenReceived(false)
    setChatFiles([])
    setChatImages([])
    setNewMessageFiles([])
    setNewMessageImages([])
    setShowFilesDisplay(false)
  }, [
    setUserInput,
    setChatMessages,
    setSelectedChat,
    setIsGenerating,
    setFirstTokenReceived,
    setChatFiles,
    setChatImages,
    setNewMessageFiles,
    setNewMessageImages,
    setShowFilesDisplay
  ])

  useEffect(() => {
    resetChatState()
  }, [resetChatState, workspaceId])

  useEffect(() => {
    if (startupStatus !== "ready" || !selectedWorkspace) return

    if (selectedWorkspace.id !== workspaceId) {
      router.replace(`/${locale}/${selectedWorkspace.id}`)
      return
    }

    setChatSettings({
      model: (modelFromQuery ||
        selectedWorkspace.default_model ||
        "gpt-4-1106-preview") as LLMID,
      prompt: UNIFIED_SYSTEM_PROMPT,
      temperature:
        selectedWorkspace.default_temperature ?? DEFAULT_CHAT_TEMPERATURE,
      contextLength:
        selectedWorkspace.default_context_length ??
        DEFAULT_CHAT_CONTEXT_LENGTH,
      includeProfileContext:
        selectedWorkspace.include_profile_context ?? true,
      includeWorkspaceInstructions:
        selectedWorkspace.include_workspace_instructions ?? true,
      embeddingsProvider:
        (selectedWorkspace.embeddings_provider as "openai" | "local") ||
        "openai"
    })
  }, [
    locale,
    modelFromQuery,
    router,
    selectedWorkspace,
    setChatSettings,
    startupStatus,
    workspaceId
  ])

  if (startupStatus === "error") {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <div className="border-border bg-background max-w-xl rounded-xl border p-6 shadow-sm">
          <h1 className="text-lg font-semibold">启动数据加载失败</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {startupError?.message || "请检查本地数据库和启动日志。"}
          </p>
          {startupError?.code === "MIGRATION_REQUIRED" && (
            <code className="bg-muted mt-4 block rounded p-3 text-sm">
              start-manor.bat --migrate
            </code>
          )}
        </div>
      </div>
    )
  }

  if (startupStatus !== "ready" || !selectedWorkspace) {
    return <Loading />
  }

  return <Dashboard>{children}</Dashboard>
}
