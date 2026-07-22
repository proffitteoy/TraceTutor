import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getAssistantById = async (
  _assistantId: string
): Promise<Tables<"assistants">> =>
  unsupportedLocalFeature("assistants.getAssistantById")

export const getAssistantWorkspacesByWorkspaceId = async (
  _workspaceId: string
): Promise<{ assistants: Tables<"assistants">[] }> => {
  return { assistants: [] as Tables<"assistants">[] }
}

export const getAssistantWorkspacesByAssistantId = async (
  _assistantId: string
): Promise<{ workspaces: Tables<"workspaces">[] }> => {
  return { workspaces: [] as Tables<"workspaces">[] }
}

export const createAssistant = async (
  _assistant: TablesInsert<"assistants">,
  _workspaceId: string
): Promise<Tables<"assistants">> =>
  unsupportedLocalFeature("assistants.createAssistant")

export const createAssistants = async (
  _assistants: TablesInsert<"assistants">[],
  _workspaceId: string
): Promise<Tables<"assistants">[]> =>
  unsupportedLocalFeature("assistants.createAssistants")

export const createAssistantWorkspaces = async (
  _items: { user_id: string; assistant_id: string; workspace_id: string }[]
): Promise<void> =>
  unsupportedLocalFeature("assistants.createAssistantWorkspaces")

export const updateAssistant = async (
  _assistantId: string,
  _assistant: TablesUpdate<"assistants">
): Promise<Tables<"assistants">> =>
  unsupportedLocalFeature("assistants.updateAssistant")

export const deleteAssistant = async (_assistantId: string): Promise<boolean> =>
  unsupportedLocalFeature("assistants.deleteAssistant")

export const deleteAssistantWorkspace = async (
  _assistantId: string,
  _workspaceId: string
): Promise<boolean> =>
  unsupportedLocalFeature("assistants.deleteAssistantWorkspace")
