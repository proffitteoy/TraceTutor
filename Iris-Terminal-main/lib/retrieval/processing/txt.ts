import type { FileItemChunk } from "@/types"
import { chunkText } from "./chunk-text"

export const processTxt = async (txt: Blob): Promise<FileItemChunk[]> => {
  const fileBuffer = Buffer.from(await txt.arrayBuffer())
  const textDecoder = new TextDecoder("utf-8")
  const textContent = textDecoder.decode(fileBuffer)

  return chunkText(textContent)
}
