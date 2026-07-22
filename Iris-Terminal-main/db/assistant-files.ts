import { Tables, TablesInsert } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getAssistantFilesByAssistantId = async (
  _assistantId: string
): Promise<{ files: Tables<"files">[] }> => {
  return { files: [] as Tables<"files">[] }
}

export const createAssistantFile = async (
  _assistantFile: TablesInsert<"assistant_files">
): Promise<Tables<"assistant_files">> =>
  unsupportedLocalFeature("assistant-files.createAssistantFile")

export const createAssistantFiles = async (
  _assistantFiles: TablesInsert<"assistant_files">[]
): Promise<Tables<"assistant_files">[]> =>
  unsupportedLocalFeature("assistant-files.createAssistantFiles")

export const deleteAssistantFile = async (
  _assistantId: string,
  _fileId: string
): Promise<boolean> =>
  unsupportedLocalFeature("assistant-files.deleteAssistantFile")
