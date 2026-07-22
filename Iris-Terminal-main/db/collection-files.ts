import { Tables, TablesInsert } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getCollectionFilesByCollectionId = async (
  _collectionId: string
): Promise<{ files: Tables<"files">[] }> => {
  return { files: [] as Tables<"files">[] }
}

export const createCollectionFile = async (
  _collectionFile: TablesInsert<"collection_files">
): Promise<Tables<"collection_files">> =>
  unsupportedLocalFeature("collection-files.createCollectionFile")

export const createCollectionFiles = async (
  _collectionFiles: TablesInsert<"collection_files">[]
): Promise<Tables<"collection_files">[]> =>
  unsupportedLocalFeature("collection-files.createCollectionFiles")

export const deleteCollectionFile = async (
  _collectionId: string,
  _fileId: string
): Promise<boolean> =>
  unsupportedLocalFeature("collection-files.deleteCollectionFile")
