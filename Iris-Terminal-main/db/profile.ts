import { TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getProfileByUserId = async (userId: string) => {
  const response = await fetch("/api/local/profile")
  if (!response.ok) {
    throw new Error("Failed to load profile")
  }
  return await response.json()
}

export const getProfilesByUserId = async (userId: string) => {
  const profile = await getProfileByUserId(userId)
  return [profile]
}

export const createProfile = async (profile: TablesInsert<"profiles">) => {
  const response = await fetch("/api/local/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  })

  if (!response.ok) {
    throw new Error("Failed to create profile")
  }

  return await response.json()
}

export const updateProfile = async (
  profileId: string,
  profile: TablesUpdate<"profiles">
) => {
  const response = await fetch("/api/local/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  })

  if (!response.ok) {
    throw new Error("Failed to update profile")
  }

  return await response.json()
}

export const deleteProfile = async (profileId: string): Promise<boolean> =>
  unsupportedLocalFeature("profile.deleteProfile")
