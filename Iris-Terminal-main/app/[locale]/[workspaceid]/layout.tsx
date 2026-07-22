"use client"

import { Dashboard } from "@/components/ui/dashboard"
import { ChatbotUIContext } from "@/context/context"
import { getAssistantWorkspacesByWorkspaceId } from "@/db/assistants"
import { getChatsByWorkspaceId } from "@/db/chats"
import { getCollectionWorkspacesByWorkspaceId } from "@/db/collections"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { getFoldersByWorkspaceId } from "@/db/folders"
import { getModelWorkspacesByWorkspaceId } from "@/db/models"
import { getPresetWorkspacesByWorkspaceId } from "@/db/presets"
import { getPromptWorkspacesByWorkspaceId } from "@/db/prompts"
import { getAssistantImageFromStorage } from "@/db/storage/assistant-images"
import { getToolWorkspacesByWorkspaceId } from "@/db/tools"
import { getWorkspaceById } from "@/db/workspaces"
import {
  EMPTY_WORKSPACE_DATA,
  LOCAL_FEATURE_CAPABILITIES
} from "@/lib/app-capabilities"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import {
  DEFAULT_CHAT_CONTEXT_LENGTH,
  DEFAULT_CHAT_TEMPERATURE
} from "@/lib/default-chat-settings"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"
import { LLMID } from "@/types"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ReactNode, useCallback, useContext, useEffect, useState } from "react"
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
    setChatSettings,
    setAssistants,
    setAssistantImages,
    setChats,
    setCollections,
    setFolders,
    setFiles,
    setPresets,
    setPrompts,
    setTools,
    setModels,
    setSelectedWorkspace,
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

  const [loading, setLoading] = useState(true)

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
    let cancelled = false

    const loadWorkspaceData = async () => {
      setLoading(true)
      resetChatState()

      try {
        const workspace = await getWorkspaceById(workspaceId)
        if (cancelled) return

        const resolvedWorkspaceId = workspace.id
        if (resolvedWorkspaceId !== workspaceId) {
          router.replace(`/${locale}/${resolvedWorkspaceId}`)
          return
        }

        setSelectedWorkspace(workspace)

        const [
          assistantData,
          chats,
          collectionData,
          folders,
          fileData,
          presetData,
          promptData,
          toolData,
          modelData
        ] = await Promise.all([
          LOCAL_FEATURE_CAPABILITIES.assistants
            ? getAssistantWorkspacesByWorkspaceId(resolvedWorkspaceId)
            : Promise.resolve(EMPTY_WORKSPACE_DATA.assistants),
          getChatsByWorkspaceId(resolvedWorkspaceId),
          LOCAL_FEATURE_CAPABILITIES.collections
            ? getCollectionWorkspacesByWorkspaceId(resolvedWorkspaceId)
            : Promise.resolve(EMPTY_WORKSPACE_DATA.collections),
          getFoldersByWorkspaceId(resolvedWorkspaceId),
          getFileWorkspacesByWorkspaceId(resolvedWorkspaceId),
          LOCAL_FEATURE_CAPABILITIES.presets
            ? getPresetWorkspacesByWorkspaceId(resolvedWorkspaceId)
            : Promise.resolve(EMPTY_WORKSPACE_DATA.presets),
          LOCAL_FEATURE_CAPABILITIES.prompts
            ? getPromptWorkspacesByWorkspaceId(resolvedWorkspaceId)
            : Promise.resolve(EMPTY_WORKSPACE_DATA.prompts),
          LOCAL_FEATURE_CAPABILITIES.tools
            ? getToolWorkspacesByWorkspaceId(resolvedWorkspaceId)
            : Promise.resolve(EMPTY_WORKSPACE_DATA.tools),
          LOCAL_FEATURE_CAPABILITIES.models
            ? getModelWorkspacesByWorkspaceId(resolvedWorkspaceId)
            : Promise.resolve(EMPTY_WORKSPACE_DATA.models)
        ])
        if (cancelled) return

        setAssistants(assistantData.assistants)
        setChats(chats)
        setCollections(collectionData.collections)
        setFolders(folders)
        setFiles(fileData.files)
        setPresets(presetData.presets)
        setPrompts(promptData.prompts)
        setTools(toolData.tools)
        setModels(modelData.models)

        const assistantImages = (
          await Promise.all(
            assistantData.assistants.map(async assistant => {
              if (!assistant.image_path) {
                return {
                  assistantId: assistant.id,
                  path: assistant.image_path,
                  base64: "",
                  url: ""
                }
              }

              const url =
                (await getAssistantImageFromStorage(assistant.image_path)) || ""
              if (!url) {
                return {
                  assistantId: assistant.id,
                  path: assistant.image_path,
                  base64: "",
                  url: ""
                }
              }

              try {
                const response = await fetch(url)
                const blob = await response.blob()
                const base64 = await convertBlobToBase64(blob)
                return {
                  assistantId: assistant.id,
                  path: assistant.image_path,
                  base64,
                  url
                }
              } catch {
                return {
                  assistantId: assistant.id,
                  path: assistant.image_path,
                  base64: "",
                  url
                }
              }
            })
          )
        ).filter(Boolean)

        if (cancelled) return
        setAssistantImages(assistantImages as any)

        setChatSettings({
          model: (modelFromQuery ||
            workspace?.default_model ||
            "gpt-4-1106-preview") as LLMID,
          prompt: UNIFIED_SYSTEM_PROMPT,
          temperature:
            workspace?.default_temperature ?? DEFAULT_CHAT_TEMPERATURE,
          contextLength:
            workspace?.default_context_length ?? DEFAULT_CHAT_CONTEXT_LENGTH,
          includeProfileContext: workspace?.include_profile_context ?? true,
          includeWorkspaceInstructions:
            workspace?.include_workspace_instructions ?? true,
          embeddingsProvider:
            (workspace?.embeddings_provider as "openai" | "local") || "openai"
        })
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadWorkspaceData()
    return () => {
      cancelled = true
    }
  }, [
    locale,
    modelFromQuery,
    resetChatState,
    router,
    setAssistantImages,
    setAssistants,
    setChatSettings,
    setChats,
    setCollections,
    setFiles,
    setFolders,
    setModels,
    setPresets,
    setPrompts,
    setSelectedWorkspace,
    setTools,
    workspaceId
  ])

  if (loading) {
    return <Loading />
  }

  return <Dashboard>{children}</Dashboard>
}
