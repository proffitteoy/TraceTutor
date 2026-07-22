export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type AnyRow = {
  [key: string]: any
}

type TableDef<Row extends AnyRow = AnyRow> = {
  Row: Row
  Insert: Partial<Row> & AnyRow
  Update: Partial<Row> & AnyRow
}

export type LocalTableName =
  | "users"
  | "profiles"
  | "workspaces"
  | "chats"
  | "messages"
  | "files"
  | "file_items"
  | "file_workspaces"
  | "chat_files"
  | "message_file_items"
  | "chat_summaries"
  | "assistants"
  | "assistant_collections"
  | "assistant_files"
  | "assistant_tools"
  | "assistant_workspaces"
  | "collections"
  | "collection_files"
  | "collection_workspaces"
  | "folders"
  | "models"
  | "presets"
  | "prompts"
  | "prompt_workspaces"
  | "tools"
  | "tool_workspaces"
  | "vaults"
  | "notes"
  | "note_chunks"
  | "note_links"
  | "retrieval_events"

type LocalTables = {
  [K in LocalTableName]: K extends keyof LocalTableRowMap
    ? TableDef<LocalTableRowMap[K]>
    : TableDef<AnyRow>
}

type LocalTableRowMap = {
  profiles: {
    id: string
    user_id: string
    profile_context: string
    display_name: string
    username: string
    image_url: string
    image_path: string
    [key: string]: any
  }
  workspaces: {
    id: string
    user_id: string
    name: string
    description: string
    default_model: string
    default_prompt: string
    default_temperature: number
    default_context_length: number
    embeddings_provider: string
    include_profile_context: boolean
    include_workspace_instructions: boolean
    instructions: string
    sharing: string
    image_path: string
    is_home: boolean
    [key: string]: any
  }
  chats: {
    id: string
    user_id: string
    workspace_id: string
    assistant_id: string | null
    folder_id: string | null
    name: string
    model: string
    prompt: string
    temperature: number
    context_length: number
    embeddings_provider: string
    include_profile_context: boolean
    include_workspace_instructions: boolean
    sharing: string
    status: string
    [key: string]: any
  }
  messages: {
    id: string
    chat_id: string
    user_id: string
    assistant_id: string | null
    content: string
    image_paths: string[]
    model: string
    role: string
    sequence_number: number
    created_at: any
    updated_at: any
    [key: string]: any
  }
  files: {
    id: string
    user_id: string
    folder_id: string | null
    name: string
    type: string
    description: string
    file_path: string
    size: number
    tokens: number
    sharing: string
    [key: string]: any
  }
  file_items: {
    id: string
    file_id: string
    user_id: string
    content: string
    tokens: number
    local_embedding: Json | null
    openai_embedding: Json | null
    [key: string]: any
  }
  prompts: {
    id: string
    user_id: string
    folder_id: string | null
    name: string
    content: string
    sharing: string
    [key: string]: any
  }
  assistants: {
    id: string
    user_id: string
    name: string
    description: string
    image_path: string
    model: string
    prompt: string
    [key: string]: any
  }
  collections: {
    id: string
    user_id: string
    name: string
    description: string
    sharing: string
    [key: string]: any
  }
  tools: {
    id: string
    user_id: string
    name: string
    description: string
    url: string
    schema: Json
    custom_headers: Json
    [key: string]: any
  }
  models: {
    id: string
    user_id: string
    name: string
    model_id: string
    provider: string
    hosted_id: string | null
    [key: string]: any
  }
  presets: {
    id: string
    user_id: string
    name: string
    description: string
    prompt: string
    model: string
    [key: string]: any
  }
  folders: {
    id: string
    user_id: string
    name: string
    type: string
    [key: string]: any
  }
  chat_summaries: {
    id: string
    chat_id: string
    user_id: string
    workspace_id: string
    summary: string
    model: string
    status: string
    [key: string]: any
  }
}

export type Tables<T extends LocalTableName> = LocalTables[T]["Row"]
export type TablesInsert<T extends LocalTableName> = LocalTables[T]["Insert"]
export type TablesUpdate<T extends LocalTableName> = LocalTables[T]["Update"]

export type Database = {
  public: {
    Tables: LocalTables
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type Enums<_T extends string> = string
