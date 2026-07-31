import { Tables } from "./database"

export type StartupStatus = "idle" | "loading" | "ready" | "error"
export type FilesStatus = "idle" | "loading" | "ready" | "error"

export interface StartupPayload {
  profile: Tables<"profiles">
  workspaces: Tables<"workspaces">[]
  workspace: Tables<"workspaces">
  chats: Tables<"chats">[]
  envKeyMap: Record<string, boolean>
}

export interface StartupErrorPayload {
  code: "MIGRATION_REQUIRED" | "STARTUP_FAILED"
  message: string
}
