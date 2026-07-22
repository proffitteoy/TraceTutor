import { ContentType } from "@/types"
import { Tables } from "@/types/database"

export const LOCAL_FEATURE_CAPABILITIES = {
  chats: true,
  files: true,
  collections: false,
  assistants: false,
  presets: false,
  prompts: false,
  tools: false,
  models: false,
  summaries: true,
  folders: false
} as const

export const isContentTypeEnabled = (contentType: ContentType) =>
  LOCAL_FEATURE_CAPABILITIES[contentType]

export const EMPTY_WORKSPACE_DATA = {
  assistants: {
    assistants: [] as Tables<"assistants">[]
  },
  collections: {
    collections: [] as Tables<"collections">[]
  },
  presets: {
    presets: [] as Tables<"presets">[]
  },
  prompts: {
    prompts: [] as Tables<"prompts">[]
  },
  tools: {
    tools: [] as Tables<"tools">[]
  },
  models: {
    models: [] as Tables<"models">[]
  }
} as const
