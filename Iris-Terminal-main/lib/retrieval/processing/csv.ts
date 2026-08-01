import type { FileItemChunk } from "@/types"
import { chunkText } from "./chunk-text"

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ",") {
      row.push(field)
      field = ""
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(field)
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
      field = ""
    } else {
      field += character
    }
  }

  row.push(field)
  if (row.some(value => value.length > 0)) rows.push(row)

  return rows
}

export const processCSV = async (csv: Blob): Promise<FileItemChunk[]> => {
  const [rawHeaders, ...rows] = parseCSV(await csv.text())
  if (!rawHeaders) return []

  const headers = rawHeaders.map((header, index) => {
    const normalized = header.replace(/^\uFEFF/, "").trim()
    return normalized || `column_${index + 1}`
  })
  const completeText = rows
    .map(row =>
      headers
        .map((column, index) => `${column}: ${row[index] ?? ""}`)
        .join("\n")
    )
    .join("\n\n")

  return chunkText(completeText, { separators: ["\n\n", "\n", " ", ""] })
}
