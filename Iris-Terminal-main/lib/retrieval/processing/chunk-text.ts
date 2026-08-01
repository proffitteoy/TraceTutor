import type { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "./constants"

const DEFAULT_SEPARATORS = ["\n\n", "\n", " ", ""]

interface ChunkTextOptions {
  chunkSize?: number
  chunkOverlap?: number
  separators?: string[]
}

function findSplitEnd(
  text: string,
  start: number,
  maximumEnd: number,
  separators: string[]
) {
  const minimumUsefulEnd = start + Math.floor((maximumEnd - start) / 2)

  for (const separator of separators) {
    if (!separator) continue

    const separatorStart = text.lastIndexOf(
      separator,
      maximumEnd - separator.length
    )
    if (separatorStart >= minimumUsefulEnd) {
      return separatorStart + separator.length
    }
  }

  return maximumEnd
}

export function chunkText(
  text: string,
  {
    chunkSize = CHUNK_SIZE,
    chunkOverlap = CHUNK_OVERLAP,
    separators = DEFAULT_SEPARATORS
  }: ChunkTextOptions = {}
): FileItemChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("chunkSize 必须是正整数")
  }
  if (
    !Number.isInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap >= chunkSize
  ) {
    throw new Error("chunkOverlap 必须大于等于 0 且小于 chunkSize")
  }

  const chunks: FileItemChunk[] = []
  let start = 0

  while (start < text.length) {
    const maximumEnd = Math.min(start + chunkSize, text.length)
    const end =
      maximumEnd === text.length
        ? maximumEnd
        : findSplitEnd(text, start, maximumEnd, separators)
    const content = text.slice(start, end).trim()

    if (content) {
      chunks.push({
        content,
        tokens: encode(content).length
      })
    }

    if (end >= text.length) break
    start = Math.max(start + 1, end - chunkOverlap)
  }

  return chunks
}
