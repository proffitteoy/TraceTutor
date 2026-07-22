import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getFoldersByWorkspaceId = async (
  _workspaceId: string
): Promise<Tables<"folders">[]> => {
  return [] as Tables<"folders">[]
}

export const createFolder = async (
  _folder: TablesInsert<"folders">
): Promise<Tables<"folders">> => unsupportedLocalFeature("folders.createFolder")

export const updateFolder = async (
  _folderId: string,
  _folder: TablesUpdate<"folders">
): Promise<Tables<"folders">> => unsupportedLocalFeature("folders.updateFolder")

export const deleteFolder = async (_folderId: string): Promise<boolean> =>
  unsupportedLocalFeature("folders.deleteFolder")
