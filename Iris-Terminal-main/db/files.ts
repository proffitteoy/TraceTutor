import { TablesInsert, TablesUpdate } from "@/types/database"
import mammoth from "mammoth"
import { toast } from "sonner"
import { unsupportedLocalFeature } from "./unsupported"

const getErrorMessageFromResponse = async (response: Response) => {
  const text = await response.text()
  if (!text) return "\u4e0a\u4f20\u5931\u8d25"

  try {
    const json = JSON.parse(text) as { message?: string }
    return json.message || text
  } catch {
    return text
  }
}

export const getFileById = async (fileId: string) => {
  const response = await fetch(`/api/local/files?file_id=${fileId}`)
  if (!response.ok) {
    throw new Error("File not found")
  }
  const json = await response.json()
  return json
}

export const getFileWorkspacesByWorkspaceId = async (workspaceId: string) => {
  const response = await fetch(`/api/local/files?workspace_id=${workspaceId}`)

  if (!response.ok) {
    throw new Error("Failed to load files")
  }

  return await response.json()
}

export const getFileWorkspacesByFileId = async (fileId: string) => {
  const response = await fetch(`/api/local/files?file_id=${fileId}`)
  if (!response.ok) {
    throw new Error("File not found")
  }
  return await response.json()
}

export const createFileBasedOnExtension = async (
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local"
) => {
  const fileExtension = file.name.split(".").pop()

  if (fileExtension === "docx") {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({
      arrayBuffer
    })

    return createDocXFile(
      result.value,
      file,
      fileRecord,
      workspace_id,
      embeddingsProvider
    )
  } else {
    return createFile(file, fileRecord, workspace_id, embeddingsProvider)
  }
}

export const createFile = async (
  file: File,
  _fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local"
) => {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("workspace_id", workspace_id)
  formData.append("embeddingsProvider", embeddingsProvider)

  const response = await fetch("/api/local/files", {
    method: "POST",
    body: formData
  })

  if (!response.ok) {
    const message = await getErrorMessageFromResponse(response)
    toast.error(`\u6587\u4ef6\u5904\u7406\u5931\u8d25\uff1a${message}`, {
      duration: 10000
    })
    throw new Error("Failed to upload file")
  }

  return await response.json()
}

export const createDocXFile = async (
  text: string,
  file: File,
  _fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local"
) => {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("workspace_id", workspace_id)
  formData.append("embeddingsProvider", embeddingsProvider)
  formData.append("text", text)

  const response = await fetch("/api/local/files", {
    method: "POST",
    body: formData
  })

  if (!response.ok) {
    const message = await getErrorMessageFromResponse(response)
    toast.error(`\u6587\u6863\u5904\u7406\u5931\u8d25\uff1a${message}`, {
      duration: 10000
    })
    throw new Error("Failed to upload docx file")
  }

  return await response.json()
}

export const createFiles = async (
  _files: TablesInsert<"files">[],
  _workspace_id: string
): Promise<never> => unsupportedLocalFeature("files.createFiles")

export const createFileWorkspace = async (_item: {
  user_id: string
  file_id: string
  workspace_id: string
}): Promise<never> => unsupportedLocalFeature("files.createFileWorkspace")

export const createFileWorkspaces = async (
  _items: { user_id: string; file_id: string; workspace_id: string }[]
): Promise<never> => unsupportedLocalFeature("files.createFileWorkspaces")

export const updateFile = async (
  fileId: string,
  file: TablesUpdate<"files">
) => {
  const response = await fetch(`/api/local/files/${fileId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(file)
  })

  if (!response.ok) {
    throw new Error("Failed to update file")
  }

  return await response.json()
}

export const deleteFile = async (fileId: string) => {
  const response = await fetch(`/api/local/files/${fileId}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    throw new Error("Failed to delete file")
  }

  return true
}

export const deleteFileWorkspace = async (
  _fileId: string,
  _workspaceId: string
): Promise<never> => unsupportedLocalFeature("files.deleteFileWorkspace")
