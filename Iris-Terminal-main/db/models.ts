import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getModelById = async (
  _modelId: string
): Promise<Tables<"models">> => unsupportedLocalFeature("models.getModelById")

export const getModelWorkspacesByWorkspaceId = async (
  _workspaceId: string
): Promise<{ models: Tables<"models">[] }> => {
  return { models: [] as Tables<"models">[] }
}

export const getModelWorkspacesByModelId = async (
  _modelId: string
): Promise<{ workspaces: Tables<"workspaces">[] }> => {
  return { workspaces: [] as Tables<"workspaces">[] }
}

export const createModel = async (
  _model: TablesInsert<"models">,
  _workspaceId: string
): Promise<Tables<"models">> => unsupportedLocalFeature("models.createModel")

export const createModels = async (
  _models: TablesInsert<"models">[],
  _workspaceId: string
): Promise<Tables<"models">[]> => unsupportedLocalFeature("models.createModels")

export const createModelWorkspaces = async (
  _items: { user_id: string; model_id: string; workspace_id: string }[]
): Promise<void> => unsupportedLocalFeature("models.createModelWorkspaces")

export const updateModel = async (
  _modelId: string,
  _model: TablesUpdate<"models">
): Promise<Tables<"models">> => unsupportedLocalFeature("models.updateModel")

export const deleteModel = async (_modelId: string): Promise<boolean> =>
  unsupportedLocalFeature("models.deleteModel")

export const deleteModelWorkspace = async (
  _modelId: string,
  _workspaceId: string
): Promise<boolean> => unsupportedLocalFeature("models.deleteModelWorkspace")
