import { storagePathToUrl } from "@/lib/storage-url"

export const uploadMessageImage = async (path: string, image: File) => {
  const bucket = "message_images"

  const imageSizeLimit = 6000000 // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`)
  }

  const formData = new FormData()
  formData.append("bucket", bucket)
  formData.append("path", path)
  formData.append("file", image)

  const response = await fetch("/api/storage/upload", {
    method: "POST",
    body: formData
  })

  if (!response.ok) {
    throw new Error("Error uploading image")
  }

  return path
}

export const getMessageImageFromStorage = async (filePath: string) => {
  return storagePathToUrl("message_images", filePath)
}
