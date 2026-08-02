const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "Node"
})
require("ts-node/register/transpile-only")

const XLSX = require("xlsx")
const { chunkText } = require("../lib/retrieval/processing/chunk-text.ts")
const { processCSV } = require("../lib/retrieval/processing/csv.ts")
const { processJSON } = require("../lib/retrieval/processing/json.ts")
const { processMarkdown } = require("../lib/retrieval/processing/md.ts")
const { processPdf } = require("../lib/retrieval/processing/pdf.ts")
const { processTxt } = require("../lib/retrieval/processing/txt.ts")
const { processXLSX } = require("../lib/retrieval/processing/xlsx.ts")

const run = async () => {
  const chunks = chunkText("abcdefghijklmnopqrstuvwxyz", {
    chunkSize: 10,
    chunkOverlap: 2,
    separators: [""]
  })
  assert.deepEqual(
    chunks.map(chunk => chunk.content),
    ["abcdefghij", "ijklmnopqr", "qrstuvwxyz"]
  )
  assert.throws(() => chunkText("invalid", { chunkSize: 10, chunkOverlap: 10 }))

  const csvChunks = await processCSV(
    new Blob(['kind,value,note\r\nsmoke,"hello, world","line 1\nline 2"\r\n'])
  )
  assert.match(csvChunks[0]?.content || "", /value: hello, world/)
  assert.match(csvChunks[0]?.content || "", /note: line 1\nline 2/)

  const jsonChunks = await processJSON(
    new Blob([JSON.stringify({ kind: "smoke", nested: { enabled: true } })])
  )
  assert.match(jsonChunks[0]?.content || "", /"enabled": true/)

  const markdownChunks = await processMarkdown(
    new Blob(["# Smoke\n\nMarkdown parser smoke test."])
  )
  assert.match(markdownChunks[0]?.content || "", /Markdown parser smoke test/)

  const txtChunks = await processTxt(new Blob(["TXT parser smoke test."]))
  assert.equal(txtChunks[0]?.content, "TXT parser smoke test.")

  const pdfFixture = path.resolve(
    __dirname,
    "../../db/sqlite/state-service/docs/reference/SQLite设计.pdf"
  )
  if (fs.existsSync(pdfFixture)) {
    const pdfChunks = await processPdf(new Blob([fs.readFileSync(pdfFixture)]))
    assert.ok(pdfChunks.length > 0)
    assert.ok(pdfChunks.some(chunk => chunk.content.length > 0))
  } else {
    console.warn("PDF fixture unavailable; PDF verification skipped")
  }

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ["kind", "value"],
    ["smoke", "XLSX parser smoke test"]
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, "Smoke")
  const xlsxChunks = await processXLSX(
    new Blob([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })])
  )
  assert.match(xlsxChunks[0]?.content || "", /XLSX parser smoke test/)

  console.log("file processing verification passed")
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
