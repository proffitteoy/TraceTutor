import type { FileItemChunk } from "@/types"
import { chunkText } from "./chunk-text"

export const processJSON = async (json: Blob): Promise<FileItemChunk[]> => {
  const parsed = JSON.parse(await json.text()) as unknown
  return chunkText(JSON.stringify(parsed, null, 2))
}
