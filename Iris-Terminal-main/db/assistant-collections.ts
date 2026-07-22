import { Tables, TablesInsert } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getAssistantCollectionsByAssistantId = async (
  _assistantId: string
): Promise<{ collections: Tables<"collections">[] }> => {
  return { collections: [] as Tables<"collections">[] }
}

export const createAssistantCollection = async (
  _assistantCollection: TablesInsert<"assistant_collections">
): Promise<Tables<"assistant_collections">> =>
  unsupportedLocalFeature("assistant-collections.createAssistantCollection")

export const createAssistantCollections = async (
  _assistantCollections: TablesInsert<"assistant_collections">[]
): Promise<Tables<"assistant_collections">[]> =>
  unsupportedLocalFeature("assistant-collections.createAssistantCollections")

export const deleteAssistantCollection = async (
  _assistantId: string,
  _collectionId: string
): Promise<boolean> =>
  unsupportedLocalFeature("assistant-collections.deleteAssistantCollection")
