import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import * as XLSX from "xlsx"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "."

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

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ["\n\n", "\n", " "]
  })
  const splitDocs = await splitter.createDocuments([completeText])

  return splitDocs.map(doc => ({
    content: doc.pageContent,
    tokens: encode(doc.pageContent).length
  }))
}
