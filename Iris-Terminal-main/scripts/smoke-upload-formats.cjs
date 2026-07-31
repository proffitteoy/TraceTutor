const JSZip = require("jszip")
const XLSX = require("xlsx")

const baseUrl = process.argv[2] || "http://127.0.0.1:3100"
const workspaceId =
  process.argv[3] || "00000000-0000-0000-0000-000000000003"
const prefix = `codex-smoke-${Date.now()}`

const createDocx = async () => {
  const zip = new JSZip()
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  )
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  )
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Codex DOCX parser smoke test.</w:t></w:r></w:p></w:body>
</w:document>`
  )
  return zip.generateAsync({ type: "nodebuffer" })
}

const createXlsx = () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ["kind", "value"],
    ["smoke", "Codex XLSX parser smoke test"]
  ])
  XLSX.utils.book_append_sheet(book, sheet, "Smoke")
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" })
}

const createPdf = () => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 51 >>\nstream\nBT /F1 12 Tf 72 720 Td (Codex PDF smoke test) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ]
  let content = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content))
    content += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(content)
  content += `xref\n0 ${objects.length + 1}\n`
  content += "0000000000 65535 f \n"
  offsets.slice(1).forEach(offset => {
    content += `${String(offset).padStart(10, "0")} 00000 n \n`
  })
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  content += `startxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(content)
}

const upload = async ({ extension, type, body }) => {
  const fileName = `${prefix}.${extension}`
  const form = new FormData()
  form.append("file", new Blob([body], { type }), fileName)
  form.append("workspace_id", workspaceId)
  form.append("embeddingsProvider", "local")

  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}/api/local/files`, {
    method: "POST",
    body: form
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { message: text }
  }

  return {
    extension,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    id: payload.id || null,
    tokens: payload.tokens ?? null,
    provider: payload.embeddings_provider_used || null,
    warning: payload.warning || payload.message || null
  }
}

const run = async () => {
  const fixtures = [
    {
      extension: "txt",
      type: "text/plain",
      body: Buffer.from("Codex TXT parser smoke test.")
    },
    {
      extension: "md",
      type: "text/markdown",
      body: Buffer.from("# Smoke\n\nCodex Markdown parser smoke test.")
    },
    {
      extension: "json",
      type: "application/json",
      body: Buffer.from(
        JSON.stringify({ kind: "smoke", value: "Codex JSON parser smoke test" })
      )
    },
    {
      extension: "csv",
      type: "text/csv",
      body: Buffer.from("kind,value\nsmoke,Codex CSV parser smoke test\n")
    },
    {
      extension: "docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: await createDocx()
    },
    {
      extension: "pdf",
      type: "application/pdf",
      body: createPdf()
    },
    {
      extension: "xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: createXlsx()
    }
  ]

  const results = []
  for (const fixture of fixtures) {
    results.push(await upload(fixture))
  }

  console.log(JSON.stringify({ prefix, results }))
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
