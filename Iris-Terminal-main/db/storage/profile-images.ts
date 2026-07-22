import { storagePathToUrl } from "@/lib/storage-url"
import { Tables } from "@/types/database"

export const uploadProfileImage = async (
  profile: Tables<"profiles">,
  image: File
) => {
  const bucket = "profile_images"

  const imageSizeLimit = 2000000 // 2MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`)
  }

  const currentPath = profile.image_path
  let filePath = `${profile.user_id}/${Date.now()}`

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

  return {
    path: filePath,
    url: storagePathToUrl("profile_images", filePath)
  }
}
