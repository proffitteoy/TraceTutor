import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getPromptById = async (
  _promptId: string
): Promise<Tables<"prompts">> =>
  unsupportedLocalFeature("prompts.getPromptById")

export const getPromptWorkspacesByWorkspaceId = async (
  _workspaceId: string
): Promise<{ prompts: Tables<"prompts">[] }> => {
  return { prompts: [] as Tables<"prompts">[] }
}

export const getPromptWorkspacesByPromptId = async (
  _promptId: string
): Promise<{ workspaces: Tables<"workspaces">[] }> => {
  return { workspaces: [] as Tables<"workspaces">[] }
}

export const createPrompt = async (
  _prompt: TablesInsert<"prompts">,
  _workspaceId: string
): Promise<Tables<"prompts">> => unsupportedLocalFeature("prompts.createPrompt")

export const createPrompts = async (
  _prompts: TablesInsert<"prompts">[],
  _workspaceId: string
): Promise<Tables<"prompts">[]> =>
  unsupportedLocalFeature("prompts.createPrompts")

export const createPromptWorkspaces = async (
  _items: { user_id: string; prompt_id: string; workspace_id: string }[]
): Promise<void> => unsupportedLocalFeature("prompts.createPromptWorkspaces")

export const updatePrompt = async (
  _promptId: string,
  _prompt: TablesUpdate<"prompts">
): Promise<Tables<"prompts">> => unsupportedLocalFeature("prompts.updatePrompt")

export const deletePrompt = async (_promptId: string): Promise<boolean> =>
  unsupportedLocalFeature("prompts.deletePrompt")

export const deletePromptWorkspace = async (
  _promptId: string,
  _workspaceId: string
): Promise<boolean> => unsupportedLocalFeature("prompts.deletePromptWorkspace")
