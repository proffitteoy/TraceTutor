import { sha256 } from "./hash"
import type { MarkdownSection } from "./markdown-parser"

export interface NoteChunkInput {
  heading_path: string[]
  content: string
  start_line: number
  end_line: number
}

export interface NoteChunkRecord {
  heading_path: string[]
  block_id: string | null
  content: string
  content_hash: string
  token_count: number
  start_line: number
  end_line: number
}

const estimateTokenCount = (value: string) =>
  Math.max(1, Math.ceil(value.trim().length / 4))

const splitSectionByParagraph = (section: NoteChunkInput, maxChars: number) => {
  const paragraphs = section.content
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return []

  const chunks: Array<{ content: string; startOffset: number; endOffset: number }> =
    []
  let current = ""
  let startOffset = 0
  let currentOffset = 0

  const flush = () => {
    const trimmed = current.trim()
    if (!trimmed) return
    chunks.push({
      content: trimmed,
      startOffset,
      endOffset: currentOffset
    })
    current = ""
  }

  paragraphs.forEach(paragraph => {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > maxChars && current) {
      flush()
      startOffset = currentOffset
      current = paragraph
    } else {
      current = candidate
    }
    currentOffset += paragraph.length + 2
  })

  flush()
  return chunks
}

export const buildNoteChunks = (
  sections: MarkdownSection[],
  maxChars = 1200
): NoteChunkRecord[] => {
  const records: NoteChunkRecord[] = []

  sections.forEach(section => {
    const chunkInputs = splitSectionByParagraph(section, maxChars)
    if (chunkInputs.length === 0) return

    chunkInputs.forEach(chunk => {
      const content = chunk.content.trim()
      if (!content) return

      records.push({
        heading_path: section.heading_path,
        block_id: null,
        content,
        content_hash: sha256(content),
        token_count: estimateTokenCount(content),
        start_line: section.start_line,
        end_line: section.end_line
      })
    })
  })

  return records
}
