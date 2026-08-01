import type { FileItemChunk } from "@/types"
import { chunkText } from "./chunk-text"

export const processPdf = async (pdf: Blob): Promise<FileItemChunk[]> => {
  const { default: parsePdf } = await import("pdf-parse")
  const parsed = await parsePdf(Buffer.from(await pdf.arrayBuffer()))
  return chunkText(parsed.text)
}
