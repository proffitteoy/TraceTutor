// TODO: Separate into multiple contexts, keeping simple for now

"use client"

import { ChatbotUIContext } from "@/context/context"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { getWorkspaceImageFromStorage } from "@/db/storage/workspace-images"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import {
  fetchHostedModels,
  fetchOpenRouterModels
} from "@/lib/models/fetch-models"
import {
  DEFAULT_CHAT_CONTEXT_LENGTH,
  DEFAULT_CHAT_TEMPERATURE
} from "@/lib/default-chat-settings"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"
import { Tables } from "@/types/database"
import {
  ChatFile,
  ChatMessage,
  ChatSettings,
  FilesStatus,
  LLM,
  MessageImage,
  OpenRouterLLM,
  StartupErrorPayload,
  StartupPayload,
  StartupStatus,
  WorkspaceImage
} from "@/types"
import { AssistantImage } from "@/types/images/assistant-image"
import { useParams } from "next/navigation"
import { FC, useCallback, useEffect, useRef, useState } from "react"

interface GlobalStateProps {
  children: React.ReactNode
}

export const GlobalState: FC<GlobalStateProps> = ({ children }) => {
  const params = useParams()
  const requestedWorkspaceId =
    typeof params.workspaceid === "string" ? params.workspaceid : ""
  const [startupStatus, setStartupStatus] =
    useState<StartupStatus>("idle")
  const [startupError, setStartupError] =
    useState<StartupErrorPayload | null>(null)
  const [filesStatus, setFilesStatus] = useState<FilesStatus>("idle")
  const filesLoadRef = useRef<{
    workspaceId: string
    promise: Promise<void>
  } | null>(null)
  const deferredModelsWorkspaceRef = useRef<string | null>(null)

  // PROFILE STORE
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null)

  // ITEMS STORE
  const [assistants, setAssistants] = useState<Tables<"assistants">[]>([])
  const [collections, setCollections] = useState<Tables<"collections">[]>([])
  const [chats, setChats] = useState<Tables<"chats">[]>([])
  const [files, setFiles] = useState<Tables<"files">[]>([])
  const [folders, setFolders] = useState<Tables<"folders">[]>([])
  const [models, setModels] = useState<Tables<"models">[]>([])
  const [presets, setPresets] = useState<Tables<"presets">[]>([])
  const [prompts, setPrompts] = useState<Tables<"prompts">[]>([])
  const [tools, setTools] = useState<Tables<"tools">[]>([])
  const [workspaces, setWorkspaces] = useState<Tables<"workspaces">[]>([])

  // MODELS STORE
  const [envKeyMap, setEnvKeyMap] = useState<Record<string, boolean>>({})
  const [availableHostedModels, setAvailableHostedModels] = useState<LLM[]>([])
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<
    OpenRouterLLM[]
  >([])

  // WORKSPACE STORE
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<Tables<"workspaces"> | null>(null)
  const [workspaceImages, setWorkspaceImages] = useState<WorkspaceImage[]>([])

  // PRESET STORE
  const [selectedPreset, setSelectedPreset] =
    useState<Tables<"presets"> | null>(null)

  // ASSISTANT STORE
  const [selectedAssistant, setSelectedAssistant] =
    useState<Tables<"assistants"> | null>(null)
  const [assistantImages, setAssistantImages] = useState<AssistantImage[]>([])
  const [openaiAssistants, setOpenaiAssistants] = useState<any[]>([])

  // PASSIVE CHAT STORE
  const [userInput, setUserInput] = useState<string>("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    model: "gpt-4-turbo-preview",
    prompt: UNIFIED_SYSTEM_PROMPT,
    temperature: DEFAULT_CHAT_TEMPERATURE,
    contextLength: DEFAULT_CHAT_CONTEXT_LENGTH,
    includeProfileContext: true,
    includeWorkspaceInstructions: true,
    embeddingsProvider: "openai"
  })
  const [selectedChat, setSelectedChat] = useState<Tables<"chats"> | null>(null)
  const [chatFileItems, setChatFileItems] = useState<Tables<"file_items">[]>([])

  // ACTIVE CHAT STORE
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [firstTokenReceived, setFirstTokenReceived] = useState<boolean>(false)
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)

  // CHAT INPUT COMMAND STORE
  const [isPromptPickerOpen, setIsPromptPickerOpen] = useState(false)
  const [slashCommand, setSlashCommand] = useState("")
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)
  const [hashtagCommand, setHashtagCommand] = useState("")
  const [isToolPickerOpen, setIsToolPickerOpen] = useState(false)
  const [toolCommand, setToolCommand] = useState("")
  const [focusPrompt, setFocusPrompt] = useState(false)
  const [focusFile, setFocusFile] = useState(false)
  const [focusTool, setFocusTool] = useState(false)
  const [focusAssistant, setFocusAssistant] = useState(false)
  const [atCommand, setAtCommand] = useState("")
  const [isAssistantPickerOpen, setIsAssistantPickerOpen] = useState(false)

  // ATTACHMENTS STORE
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([])
  const [chatImages, setChatImages] = useState<MessageImage[]>([])
  const [newMessageFiles, setNewMessageFiles] = useState<ChatFile[]>([])
  const [newMessageImages, setNewMessageImages] = useState<MessageImage[]>([])
  const [showFilesDisplay, setShowFilesDisplay] = useState<boolean>(false)

  // RETIEVAL STORE
  const [useRetrieval, setUseRetrieval] = useState<boolean>(true)
  const [sourceCount, setSourceCount] = useState<number>(4)

  // TOOL STORE
  const [selectedTools, setSelectedTools] = useState<Tables<"tools">[]>([])
  const [toolInUse, setToolInUse] = useState<string>("none")

  useEffect(() => {
    let cancelled = false

    const loadStartupData = async () => {
      setStartupStatus("loading")
      setStartupError(null)
      setFiles([])
      setFilesStatus("idle")
      filesLoadRef.current = null
      deferredModelsWorkspaceRef.current = null

      try {
        const query = requestedWorkspaceId
          ? `?workspace_id=${encodeURIComponent(requestedWorkspaceId)}`
          : ""
        const response = await fetch(`/api/local/startup${query}`)

        if (!response.ok) {
          const error = (await response.json()) as StartupErrorPayload
          if (!cancelled) {
            setStartupError(error)
            setStartupStatus("error")
          }
          return
        }

        const payload = (await response.json()) as StartupPayload
        const hostedModelResult = await fetchHostedModels(
          payload.profile,
          payload.envKeyMap,
          { loadRemoteModels: false }
        )

        if (cancelled) return

        setProfile(payload.profile)
        setWorkspaces(payload.workspaces)
        setSelectedWorkspace(payload.workspace)
        setChats(payload.chats)
        setEnvKeyMap(payload.envKeyMap)
        setAvailableHostedModels(hostedModelResult?.hostedModels || [])
        setAvailableOpenRouterModels([])
        setStartupStatus("ready")

        if (payload.workspace.image_path) {
          void (async () => {
            const url =
              (await getWorkspaceImageFromStorage(
                payload.workspace.image_path
              )) || ""
            if (!url || cancelled) return

            const imageResponse = await fetch(url)
            const blob = await imageResponse.blob()
            const base64 = await convertBlobToBase64(blob)
            if (cancelled) return

            setWorkspaceImages([
              {
                workspaceId: payload.workspace.id,
                path: payload.workspace.image_path,
                base64,
                url
              }
            ])
          })()
        } else {
          setWorkspaceImages([])
        }
      } catch (error) {
        if (cancelled) return
        setStartupError({
          code: "STARTUP_FAILED",
          message: (error as Error)?.message || "本地启动数据加载失败。"
        })
        setStartupStatus("error")
      }
    }

    void loadStartupData()
    return () => {
      cancelled = true
    }
  }, [requestedWorkspaceId])

  const ensureFilesLoaded = useCallback(async () => {
    const workspaceId = selectedWorkspace?.id
    if (!workspaceId || filesStatus === "ready") return

    if (filesLoadRef.current?.workspaceId === workspaceId) {
      return filesLoadRef.current.promise
    }

    const promise = (async () => {
      setFilesStatus("loading")
      try {
        const result = await getFileWorkspacesByWorkspaceId(workspaceId)
        setFiles(result.files || [])
        setFilesStatus("ready")
      } catch (error) {
        filesLoadRef.current = null
        setFilesStatus("error")
        throw error
      }
    })()

    filesLoadRef.current = { workspaceId, promise }
    return promise
  }, [filesStatus, selectedWorkspace?.id])

  useEffect(() => {
    if (
      startupStatus !== "ready" ||
      !profile ||
      !selectedWorkspace ||
      typeof window === "undefined"
    ) {
      return
    }

    const workspaceId = selectedWorkspace.id
    const loadDeferredData = async () => {
      void ensureFilesLoaded().catch(() => {})

      if (deferredModelsWorkspaceRef.current === workspaceId) return
      deferredModelsWorkspaceRef.current = workspaceId

      const hostedModelResult = await fetchHostedModels(profile, envKeyMap, {
        loadRemoteModels: true
      })
      if (hostedModelResult) {
        setAvailableHostedModels(hostedModelResult.hostedModels)
      }

      if (profile.openrouter_api_key || envKeyMap.openrouter) {
        const openRouterModels = await fetchOpenRouterModels()
        if (openRouterModels) {
          setAvailableOpenRouterModels(openRouterModels)
        }
      }
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(
        () => void loadDeferredData(),
        { timeout: 1500 }
      )
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = setTimeout(() => void loadDeferredData(), 500)
    return () => clearTimeout(timeoutId)
  }, [
    ensureFilesLoaded,
    envKeyMap,
    profile,
    selectedWorkspace,
    startupStatus
  ])

  return (
    <ChatbotUIContext.Provider
      value={{
        startupStatus,
        startupError,
        filesStatus,
        ensureFilesLoaded,

        // PROFILE STORE
        profile,
        setProfile,

        // ITEMS STORE
        assistants,
        setAssistants,
        collections,
        setCollections,
        chats,
        setChats,
        files,
        setFiles,
        folders,
        setFolders,
        models,
        setModels,
        presets,
        setPresets,
        prompts,
        setPrompts,
        tools,
        setTools,
        workspaces,
        setWorkspaces,

        // MODELS STORE
        envKeyMap,
        setEnvKeyMap,
        availableHostedModels,
        setAvailableHostedModels,
        availableOpenRouterModels,
        setAvailableOpenRouterModels,

        // WORKSPACE STORE
        selectedWorkspace,
        setSelectedWorkspace,
        workspaceImages,
        setWorkspaceImages,

        // PRESET STORE
        selectedPreset,
        setSelectedPreset,

        // ASSISTANT STORE
        selectedAssistant,
        setSelectedAssistant,
        assistantImages,
        setAssistantImages,
        openaiAssistants,
        setOpenaiAssistants,

        // PASSIVE CHAT STORE
        userInput,
        setUserInput,
        chatMessages,
        setChatMessages,
        chatSettings,
        setChatSettings,
        selectedChat,
        setSelectedChat,
        chatFileItems,
        setChatFileItems,

        // ACTIVE CHAT STORE
        isGenerating,
        setIsGenerating,
        firstTokenReceived,
        setFirstTokenReceived,
        abortController,
        setAbortController,

        // CHAT INPUT COMMAND STORE
        isPromptPickerOpen,
        setIsPromptPickerOpen,
        slashCommand,
        setSlashCommand,
        isFilePickerOpen,
        setIsFilePickerOpen,
        hashtagCommand,
        setHashtagCommand,
        isToolPickerOpen,
        setIsToolPickerOpen,
        toolCommand,
        setToolCommand,
        focusPrompt,
        setFocusPrompt,
        focusFile,
        setFocusFile,
        focusTool,
        setFocusTool,
        focusAssistant,
        setFocusAssistant,
        atCommand,
        setAtCommand,
        isAssistantPickerOpen,
        setIsAssistantPickerOpen,

        // ATTACHMENT STORE
        chatFiles,
        setChatFiles,
        chatImages,
        setChatImages,
        newMessageFiles,
        setNewMessageFiles,
        newMessageImages,
        setNewMessageImages,
        showFilesDisplay,
        setShowFilesDisplay,

        // RETRIEVAL STORE
        useRetrieval,
        setUseRetrieval,
        sourceCount,
        setSourceCount,

        // TOOL STORE
        selectedTools,
        setSelectedTools,
        toolInUse,
        setToolInUse
      }}
    >
      {children}
    </ChatbotUIContext.Provider>
  )
}
