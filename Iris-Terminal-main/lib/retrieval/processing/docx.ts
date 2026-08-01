import type { FileItemChunk } from "@/types"
import { chunkText } from "./chunk-text"

export const processDocX = async (text: string): Promise<FileItemChunk[]> => {
  return chunkText(text)
}
