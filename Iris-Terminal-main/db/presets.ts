import { Tables, TablesInsert, TablesUpdate } from "@/types/database"
import { unsupportedLocalFeature } from "./unsupported"

export const getPresetById = async (
  _presetId: string
): Promise<Tables<"presets">> =>
  unsupportedLocalFeature("presets.getPresetById")

export const getPresetWorkspacesByWorkspaceId = async (
  _workspaceId: string
): Promise<{ presets: Tables<"presets">[] }> => {
  return { presets: [] as Tables<"presets">[] }
}

export const getPresetWorkspacesByPresetId = async (
  _presetId: string
): Promise<{ workspaces: Tables<"workspaces">[] }> => {
  return { workspaces: [] as Tables<"workspaces">[] }
}

export const createPreset = async (
  _preset: TablesInsert<"presets">,
  _workspaceId: string
): Promise<Tables<"presets">> => unsupportedLocalFeature("presets.createPreset")

export const createPresets = async (
  _presets: TablesInsert<"presets">[],
  _workspaceId: string
): Promise<Tables<"presets">[]> =>
  unsupportedLocalFeature("presets.createPresets")

export const createPresetWorkspaces = async (
  _items: { user_id: string; preset_id: string; workspace_id: string }[]
): Promise<void> => unsupportedLocalFeature("presets.createPresetWorkspaces")

export const updatePreset = async (
  _presetId: string,
  _preset: TablesUpdate<"presets">
): Promise<Tables<"presets">> => unsupportedLocalFeature("presets.updatePreset")

export const deletePreset = async (_presetId: string): Promise<boolean> =>
  unsupportedLocalFeature("presets.deletePreset")

export const deletePresetWorkspace = async (
  _presetId: string,
  _workspaceId: string
): Promise<boolean> => unsupportedLocalFeature("presets.deletePresetWorkspace")
