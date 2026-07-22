import { storagePathToUrl } from "@/lib/storage-url"
import { toast } from "sonner"

export const uploadFile = async (
  file: File,
  payload: {
    name: string
    user_id: string
    file_id: string
  }
) => {
  const SIZE_LIMIT = parseInt(
    process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT || "10000000"
  )

  if (file.size > SIZE_LIMIT) {
    throw new Error(
      `File must be less than ${Math.floor(SIZE_LIMIT / 1000000)}MB`
    )
  }

  const filePath = `${payload.user_id}/${Buffer.from(payload.file_id).toString("base64")}/${payload.name}`

  const formData = new FormData()
  formData.append("bucket", "files")
  formData.append("path", filePath)
  formData.append("file", file)

  const response = await fetch("/api/storage/upload", {
    method: "POST",
    body: formData
  })

  if (!response.ok) {
    throw new Error("Error uploading file")
  }

  return filePath
}

export const deleteFileFromStorage = async (filePath: string) => {
  const response = await fetch("/api/storage/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bucket: "files", path: filePath })
  })

  if (!response.ok) {
    toast.error("Failed to remove file!")
  }
}

export const getFileFromStorage = async (filePath: string) => {
  return storagePathToUrl("files", filePath)
}
