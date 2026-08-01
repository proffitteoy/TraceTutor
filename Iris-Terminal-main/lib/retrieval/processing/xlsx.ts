import type { FileItemChunk } from "@/types"
import * as XLSX from "xlsx"
import { chunkText } from "./chunk-text"

export const processXLSX = async (
  spreadsheet: Blob
): Promise<FileItemChunk[]> => {
  const buffer = Buffer.from(await spreadsheet.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })

  const completeText = workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return ""

    const csvText = XLSX.utils
      .sheet_to_csv(sheet, {
        blankrows: false
      })
      .trim()

    if (!csvText) {
      return ""
    }

    return `# Sheet: ${sheetName}\n${csvText}`
  })
    .filter(Boolean)
    .join("\n\n")

  if (!completeText) {
    return []
  }

  return chunkText(completeText)
}
