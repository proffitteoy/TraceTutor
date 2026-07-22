import { Tables } from "@/types/database"

export interface ChatMessage {
  message: Tables<"messages">
  fileItems: string[]
}
