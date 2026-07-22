import { Tables, TablesInsert } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getAssistantToolsByAssistantId = async (
  _assistantId: string
): Promise<{ tools: Tables<"tools">[] }> => {
  return { tools: [] as Tables<"tools">[] }
}

export const createAssistantTool = async (
  _assistantTool: TablesInsert<"assistant_tools">
): Promise<Tables<"assistant_tools">> =>
  unsupportedLocalFeature("assistant-tools.createAssistantTool")

export const createAssistantTools = async (
  _assistantTools: TablesInsert<"assistant_tools">[]
): Promise<Tables<"assistant_tools">[]> =>
  unsupportedLocalFeature("assistant-tools.createAssistantTools")

export const deleteAssistantTool = async (
  _assistantId: string,
  _toolId: string
): Promise<boolean> =>
  unsupportedLocalFeature("assistant-tools.deleteAssistantTool")
