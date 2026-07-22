import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getToolById = async (_toolId: string): Promise<Tables<"tools">> =>
  unsupportedLocalFeature("tools.getToolById")

export const getToolWorkspacesByWorkspaceId = async (
  _workspaceId: string
): Promise<{ tools: Tables<"tools">[] }> => {
  return { tools: [] as Tables<"tools">[] }
}

export const getToolWorkspacesByToolId = async (
  _toolId: string
): Promise<{ workspaces: Tables<"workspaces">[] }> => {
  return { workspaces: [] as Tables<"workspaces">[] }
}

export const createTool = async (
  _tool: TablesInsert<"tools">,
  _workspaceId: string
): Promise<Tables<"tools">> => unsupportedLocalFeature("tools.createTool")

export const createTools = async (
  _tools: TablesInsert<"tools">[],
  _workspaceId: string
): Promise<Tables<"tools">[]> => unsupportedLocalFeature("tools.createTools")

export const createToolWorkspaces = async (
  _items: { user_id: string; tool_id: string; workspace_id: string }[]
): Promise<void> => unsupportedLocalFeature("tools.createToolWorkspaces")

export const updateTool = async (
  _toolId: string,
  _tool: TablesUpdate<"tools">
): Promise<Tables<"tools">> => unsupportedLocalFeature("tools.updateTool")

export const deleteTool = async (_toolId: string): Promise<boolean> =>
  unsupportedLocalFeature("tools.deleteTool")

export const deleteToolWorkspace = async (
  _toolId: string,
  _workspaceId: string
): Promise<boolean> => unsupportedLocalFeature("tools.deleteToolWorkspace")
