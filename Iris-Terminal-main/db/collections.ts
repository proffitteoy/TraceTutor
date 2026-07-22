import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getCollectionById = async (
  _collectionId: string
): Promise<Tables<"collections">> =>
  unsupportedLocalFeature("collections.getCollectionById")

export const getCollectionWorkspacesByWorkspaceId = async (
  _workspaceId: string
): Promise<{ collections: Tables<"collections">[] }> => {
  return { collections: [] as Tables<"collections">[] }
}

export const getCollectionWorkspacesByCollectionId = async (
  _collectionId: string
): Promise<{ workspaces: Tables<"workspaces">[] }> => {
  return { workspaces: [] as Tables<"workspaces">[] }
}

export const createCollection = async (
  _collection: TablesInsert<"collections">,
  _workspaceId: string
): Promise<Tables<"collections">> =>
  unsupportedLocalFeature("collections.createCollection")

export const createCollections = async (
  _collections: TablesInsert<"collections">[],
  _workspaceId: string
): Promise<Tables<"collections">[]> =>
  unsupportedLocalFeature("collections.createCollections")

export const createCollectionWorkspaces = async (
  _items: { user_id: string; collection_id: string; workspace_id: string }[]
): Promise<void> =>
  unsupportedLocalFeature("collections.createCollectionWorkspaces")

export const updateCollection = async (
  _collectionId: string,
  _collection: TablesUpdate<"collections">
): Promise<Tables<"collections">> =>
  unsupportedLocalFeature("collections.updateCollection")

export const deleteCollection = async (
  _collectionId: string
): Promise<boolean> => unsupportedLocalFeature("collections.deleteCollection")

export const deleteCollectionWorkspace = async (
  _collectionId: string,
  _workspaceId: string
): Promise<boolean> =>
  unsupportedLocalFeature("collections.deleteCollectionWorkspace")
