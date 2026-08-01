import type { FileItemChunk } from "@/types"
import { chunkText } from "./chunk-text"

export const processMarkdown = async (
  markdown: Blob
): Promise<FileItemChunk[]> => {
  const fileBuffer = Buffer.from(await markdown.arrayBuffer())
  const textDecoder = new TextDecoder("utf-8")
  const textContent = textDecoder.decode(fileBuffer)

  return chunkText(textContent, {
    separators: ["\n## ", "\n### ", "\n\n", "\n", " ", ""]
  })
}
