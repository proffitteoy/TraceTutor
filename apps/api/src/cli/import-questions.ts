import "dotenv/config"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Pool } from "pg"

interface CliOptions {
  file: string
  batchName: string
  batchKey?: string
  apiUrl: string
  token?: string
  chunkSize: number
  approvedManifest?: string
  tagDictionary?: string
}

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function parseOptions(args: string[]): CliOptions {
  const file = valueAfter(args, "--file")
  if (!file) {
    throw new Error(
      "缺少 --file。示例：npm run questions:import -- --file ./questions.jsonl --batch-name 极限首批题库"
    )
  }
  const absoluteFile = resolve(file)
  const chunkSize = Number(valueAfter(args, "--chunk-size") ?? "20")
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 50) {
    throw new Error("--chunk-size 必须是 1 到 50 的整数")
  }
  const batchKey = valueAfter(args, "--batch-key")
  const approvedManifest = valueAfter(args, "--activate-approved-manifest")
  const tagDictionary = valueAfter(args, "--tag-dictionary")
  return {
    file: absoluteFile,
    batchName: valueAfter(args, "--batch-name") ?? absoluteFile,
    ...(batchKey ? { batchKey } : {}),
    apiUrl: (
      valueAfter(args, "--api-url") ??
      process.env.TRACE_TUTOR_API_URL ??
      "http://127.0.0.1:4100"
    ).replace(/\/$/, ""),
    ...(process.env.TRACE_TUTOR_TOOL_TOKEN
      ? { token: process.env.TRACE_TUTOR_TOOL_TOKEN }
      : {}),
    chunkSize
    ,...(approvedManifest
      ? { approvedManifest: resolve(approvedManifest) }
      : {})
    ,...(tagDictionary ? { tagDictionary: resolve(tagDictionary) } : {})
  }
}

interface TaxonomyDictionary {
  subjects: Array<{ code: string; name: string }>
  knowledge_points: Array<{ code: string; name: string; subject_code: string }>
  methods: Array<{ code: string; name: string; method_type?: string }>
}

async function seedTaxonomy(options: CliOptions): Promise<void> {
  const dictionaryFile =
    options.tagDictionary ??
    (options.approvedManifest
      ? join(dirname(options.approvedManifest), "tag-dictionary.json")
      : undefined)
  if (!dictionaryFile) return
  const connectionString = process.env.TRACE_TUTOR_PGSQL_URL
  if (!connectionString) {
    throw new Error("初始化标签字典需要 TRACE_TUTOR_PGSQL_URL")
  }
  const dictionary = JSON.parse(
    await readFile(dictionaryFile, "utf8")
  ) as TaxonomyDictionary
  const pool = new Pool({
    connectionString,
    options: "-c search_path=pg_catalog,public"
  })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const subject of dictionary.subjects) {
      await client.query(
        `INSERT INTO subject_domain(name,code,level)
         VALUES ($1,$2,1)
         ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name`,
        [subject.name, subject.code]
      )
    }
    for (const item of dictionary.knowledge_points) {
      await client.query(
        `INSERT INTO knowledge_point(subject_id,name,code)
         SELECT id,$1,$2 FROM subject_domain WHERE code=$3
         ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,subject_id=EXCLUDED.subject_id`,
        [item.name, item.code, item.subject_code]
      )
    }
    for (const item of dictionary.methods) {
      await client.query(
        `INSERT INTO method_asset(name,code,method_type)
         VALUES ($1,$2,$3)
         ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,method_type=EXCLUDED.method_type`,
        [item.name, item.code, item.method_type ?? null]
      )
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

interface ApprovedManifest {
  batch_key: string
  jsonl_sha256: string
  approval: {
    status: string
    approved_external_ids: string[]
  }
}

async function activateApprovedQuestions(
  options: CliOptions,
  content: string
): Promise<void> {
  if (!options.approvedManifest) return
  const manifest = JSON.parse(
    await readFile(options.approvedManifest, "utf8")
  ) as ApprovedManifest
  const digest = createHash("sha256").update(content, "utf8").digest("hex")
  if (manifest.jsonl_sha256 !== digest) {
    throw new Error("manifest 的 JSONL SHA-256 与导入文件不一致")
  }
  if (manifest.approval.status !== "approved_for_import") {
    throw new Error("manifest 未记录 approved_for_import")
  }
  const approved = new Set(manifest.approval.approved_external_ids)
  const pending = new Map<string, string>()
  let cursor: string | undefined
  do {
    const query = new URLSearchParams({ status: "pending", limit: "100" })
    if (cursor) query.set("cursor", cursor)
    const response = await fetch(
      `${options.apiUrl}/internal/question-ingestion/review-queue?${query}`,
      { headers: options.token ? { Authorization: `Bearer ${options.token}` } : {} }
    )
    const page = (await response.json()) as {
      items: Array<{
        reviewItemId: string
        question: { externalId?: string }
      }>
      nextCursor?: string
    }
    if (!response.ok) throw new Error(`读取复核队列失败：${JSON.stringify(page)}`)
    for (const item of page.items) {
      if (item.question.externalId && approved.has(item.question.externalId)) {
        pending.set(item.question.externalId, item.reviewItemId)
      }
    }
    cursor = page.nextCursor
  } while (cursor)

  const missing = [...approved].filter(id => !pending.has(id))
  if (missing.length) {
    throw new Error(`批准清单有 ${missing.length} 项未找到真实复核项：${missing.slice(0, 5).join(", ")}`)
  }
  for (const [externalId, reviewItemId] of pending) {
    const response = await fetch(
      `${options.apiUrl}/internal/question-ingestion/reviews/${reviewItemId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        body: JSON.stringify({
          reviewer: "explicit_user_approval",
          decision: "approve",
          review_note: `初始化批次 ${manifest.batch_key} 已明确批准；external_id=${externalId}`
        })
      }
    )
    if (!response.ok) {
      throw new Error(`激活 ${externalId} 失败：${JSON.stringify(await response.json())}`)
    }
  }
  process.stdout.write(`已按 manifest 激活 ${pending.size} 道题。\n`)
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  const content = await readFile(options.file, "utf8")
  let approvedManifest: ApprovedManifest | undefined
  if (options.approvedManifest) {
    approvedManifest = JSON.parse(
      await readFile(options.approvedManifest, "utf8")
    ) as ApprovedManifest
    const digest = createHash("sha256").update(content, "utf8").digest("hex")
    if (
      approvedManifest.jsonl_sha256 !== digest ||
      approvedManifest.approval.status !== "approved_for_import"
    ) {
      throw new Error("批准 manifest 状态或 JSONL SHA-256 不匹配")
    }
  }
  await seedTaxonomy(options)
  const lines = content
    .split(/\r?\n/)
    .map((rawText, index) => ({ rawText, lineNumber: index + 1 }))
    .filter(item => item.rawText.trim().length > 0)
  if (lines.length === 0) throw new Error("JSONL 文件没有题目")

  const batchKey =
    options.batchKey ??
    createHash("sha256")
      .update(`${options.file}\0${content}`, "utf8")
      .digest("hex")
  const totals = { received: 0, imported: 0, duplicates: 0, failed: 0 }

  for (let offset = 0; offset < lines.length; offset += options.chunkSize) {
    const chunk = lines.slice(offset, offset + options.chunkSize)
    const finalChunk = offset + options.chunkSize >= lines.length
    const items = chunk.map(item => {
      try {
        return {
          line_number: item.lineNumber,
          raw_text: item.rawText,
          raw_json: JSON.parse(item.rawText) as unknown
        }
      } catch {
        return {
          line_number: item.lineNumber,
          raw_text: item.rawText
        }
      }
    })
    const response = await fetch(
      `${options.apiUrl}/internal/question-ingestion/import-chunk`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {})
        },
        body: JSON.stringify({
          batch_key: batchKey,
          batch_name: options.batchName,
          source_type: "jsonl",
          source_uri: options.file,
          approval_mode: approvedManifest ? "activate" : "review",
          ...(approvedManifest
            ? { approval_source: "explicit_user_approval" }
            : {}),
          final_chunk: finalChunk,
          items
        })
      }
    )
    const payload: unknown = await response.json()
    if (!response.ok) {
      throw new Error(
        `导入分片失败（HTTP ${response.status}）：${JSON.stringify(payload)}`
      )
    }
    const summary = payload as {
      received: number
      imported: number
      duplicates: number
      failed: number
    }
    totals.received += summary.received
    totals.imported += summary.imported
    totals.duplicates += summary.duplicates
    totals.failed += summary.failed
    process.stdout.write(
      `已处理 ${totals.received}/${lines.length}，导入 ${totals.imported}，重复 ${totals.duplicates}，失败 ${totals.failed}\n`
    )
  }

  if (totals.failed > 0) process.exitCode = 2
}

await main()
