import { ChatbotUIContext } from "@/context/context"
import { createDocXFile, createFile } from "@/db/files"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import mammoth from "mammoth"
import { useContext, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

const ACCEPTED_MIME_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/xml",
  "text/xml",
  "application/json",
  "text/markdown",
  "text/x-markdown",
  "application/pdf",
  "text/plain"
]

const ACCEPTED_EXTENSIONS = [
  ".csv",
  ".docx",
  ".doc",
  ".xls",
  ".xlsx",
  ".xsl",
  ".json",
  ".md",
  ".pdf",
  ".txt"
]

export const ACCEPTED_FILE_TYPES = [
  ...ACCEPTED_MIME_TYPES,
  ...ACCEPTED_EXTENSIONS
].join(",")

const getNormalizedFileType = (file: File) => {
  const lowerName = file.name.toLowerCase()
  const mimeType = (file.type || "").toLowerCase()

  if (lowerName.endsWith(".pdf") || mimeType.includes("pdf")) return "pdf"
  if (lowerName.endsWith(".md") || mimeType.includes("markdown")) return "md"

  if (
    lowerName.endsWith(".docx") ||
    mimeType.includes("wordprocessingml.document")
  ) {
    return "docx"
  }

  if (lowerName.endsWith(".doc") || mimeType === "application/msword") {
    return "doc"
  }

  if (lowerName.endsWith(".xlsx") || mimeType.includes("spreadsheetml.sheet")) {
    return "xlsx"
  }

  if (lowerName.endsWith(".xls") || mimeType === "application/vnd.ms-excel") {
    return "xls"
  }

  if (
    lowerName.endsWith(".xsl") ||
    mimeType === "application/xml" ||
    mimeType === "text/xml"
  ) {
    return "xsl"
  }

  if (lowerName.endsWith(".csv") || mimeType.includes("csv")) return "csv"
  if (lowerName.endsWith(".json") || mimeType.includes("json")) return "json"
  if (lowerName.endsWith(".txt") || mimeType.includes("plain")) return "txt"

  return ""
}

const isAcceptedDocument = (file: File) => {
  const normalizedType = getNormalizedFileType(file)
  if (!normalizedType) return false

  if (!file.type || file.type === "application/octet-stream") {
    return true
  }

  return ACCEPTED_MIME_TYPES.includes(file.type)
}

export const useSelectFileHandler = () => {
  const {
    selectedWorkspace,
    profile,
    models,
    chatSettings,
    availableHostedModels,
    availableOpenRouterModels,
    setChatSettings,
    setNewMessageImages,
    setNewMessageFiles,
    setShowFilesDisplay,
    setFiles,
    setUseRetrieval
  } = useContext(ChatbotUIContext)

  const [filesToAccept, setFilesToAccept] = useState(ACCEPTED_FILE_TYPES)

  const uniqueModels = useMemo(() => {
    const allModels = [
      ...models.map(model => ({
        modelId: model.model_id as any,
        modelName: model.name,
        provider: "custom" as const,
        hostedId: model.id,
        platformLink: "",
        imageInput: false
      })),
      ...LLM_LIST,
      ...availableHostedModels,
      ...availableOpenRouterModels
    ]

    return Array.from(
      allModels
        .reduce((map, model) => {
          if (!map.has(model.modelId)) {
            map.set(model.modelId, model)
          }
          return map
        }, new Map<string, (typeof allModels)[number]>())
        .values()
    )
  }, [models, availableHostedModels, availableOpenRouterModels])

  useEffect(() => {
    const model = chatSettings?.model
    const fullModel = uniqueModels.find(llm => llm.modelId === model)
    if (!fullModel) return

    setFilesToAccept(
      fullModel.imageInput
        ? `${ACCEPTED_FILE_TYPES},image/*`
        : ACCEPTED_FILE_TYPES
    )
  }, [chatSettings?.model, uniqueModels])

  const handleSelectDeviceFile = async (file: File) => {
    if (!profile || !selectedWorkspace || !chatSettings) return

    let selectedModel = uniqueModels.find(
      llm => llm.modelId === chatSettings.model
    )
    let imageSupported = Boolean(selectedModel?.imageInput)

    if (file.type.includes("image") && !imageSupported) {
      const fallbackCandidates = [
        "gptsapi::gpt-4o",
        "gptsapi::gemini-2.5-flash-image-hd",
        "gptsapi::gemini-3-pro-image-preview",
        "gemini-1.5-flash",
        "gemini-1.5-pro-latest",
        "gpt-4o",
        "gemini-pro-vision"
      ]

      const fallbackModel =
        fallbackCandidates
          .map(modelId =>
            uniqueModels.find(candidate => candidate.modelId === modelId)
          )
          .find(Boolean) || uniqueModels.find(candidate => candidate.imageInput)

      if (!fallbackModel) {
        toast.error("当前模型不支持图片输入，且未找到可用的图像模型。")
        return
      }

      setChatSettings(prev => ({
        ...prev,
        model: fallbackModel.modelId as any
      }))

      selectedModel = fallbackModel
      imageSupported = Boolean(selectedModel?.imageInput)

      if (imageSupported) {
        toast.success(
          `已自动切换到 ${selectedModel?.modelName}，可继续上传图片。`
        )
      } else {
        toast.error("自动切换模型失败，请手动切换支持图片输入的模型。")
        return
      }
    }

    setShowFilesDisplay(true)
    setUseRetrieval(true)

    if (file.type.includes("image")) {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onloadend = async function () {
        const imageUrl = URL.createObjectURL(file)
        setNewMessageImages(prev => [
          ...prev,
          {
            messageId: "temp",
            path: "",
            base64: reader.result,
            url: imageUrl,
            file
          }
        ])
      }
      return
    }

    if (!isAcceptedDocument(file)) {
      toast.error("不支持的文件类型")
      return
    }

    const normalizedType = getNormalizedFileType(file)
    if (!normalizedType) {
      toast.error("无法识别的文件类型")
      return
    }

    setNewMessageFiles(prev => [
      ...prev,
      {
        id: "loading",
        name: file.name,
        type: normalizedType,
        file
      }
    ])

    try {
      const createdFile =
        normalizedType === "docx"
          ? await createDocXFile(
              (
                await mammoth.extractRawText({
                  arrayBuffer: await file.arrayBuffer()
                })
              ).value,
              file,
              {
                user_id: profile.user_id,
                description: "",
                file_path: "",
                name: file.name,
                size: file.size,
                tokens: 0,
                type: normalizedType
              },
              selectedWorkspace.id,
              chatSettings.embeddingsProvider
            )
          : await createFile(
              file,
              {
                user_id: profile.user_id,
                description: "",
                file_path: "",
                name: file.name,
                size: file.size,
                tokens: 0,
                type: normalizedType
              },
              selectedWorkspace.id,
              chatSettings.embeddingsProvider
            )

      setFiles(prev => [...prev, createdFile])
      setNewMessageFiles(prev =>
        prev.map(item =>
          item.id === "loading"
            ? {
                id: createdFile.id,
                name: createdFile.name,
                type: createdFile.type,
                file
              }
            : item
        )
      )
    } catch (error: any) {
      toast.error("上传失败：" + (error?.message || "未知错误"), {
        duration: 10000
      })
      setNewMessageFiles(prev => prev.filter(item => item.id !== "loading"))
    }
  }

  return {
    handleSelectDeviceFile,
    filesToAccept
  }
}
