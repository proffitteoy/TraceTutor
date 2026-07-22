import { storagePathToUrl } from "@/lib/storage-url"
import { Tables } from "@/types/database"

export const uploadWorkspaceImage = async (
  workspace: Tables<"workspaces">,
  image: File
) => {
  const bucket = "workspace_images"

  const imageSizeLimit = 6000000 // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`)
  }

  const currentPath = workspace.image_path
  let filePath = `${workspace.user_id}/${workspace.id}/${Date.now()}`

  if (currentPath.length > 0) {
    const deleteResponse = await fetch("/api/storage/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ bucket, path: currentPath })
    })

    if (!deleteResponse.ok) {
      throw new Error("Error deleting old image")
    }
  }

  const formData = new FormData()
  formData.append("bucket", bucket)
  formData.append("path", filePath)
  formData.append("file", image)

  const uploadResponse = await fetch("/api/storage/upload", {
    method: "POST",
    body: formData
  })

  if (!uploadResponse.ok) {
    throw new Error("Error uploading image")
  }

  return filePath
}

export const getWorkspaceImageFromStorage = async (filePath: string) => {
  try {
    return storagePathToUrl("workspace_images", filePath)
  } catch (error) {
    console.error(error)
  }
}
