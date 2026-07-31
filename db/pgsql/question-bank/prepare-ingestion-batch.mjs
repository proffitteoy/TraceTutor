import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const progressPath = join(root, "progress.json")
const dictionaryPath = join(root, "tag-dictionary.json")
const jsonlName = "approved-initial-batch-2026-07-30.jsonl"
const manifestName = "approved-initial-batch-2026-07-30.manifest.json"

const sha256 = value =>
  createHash("sha256").update(value, "utf8").digest("hex")

const readJson = async path =>
  JSON.parse(await readFile(path, "utf8"))

const progress = await readJson(progressPath)
const dictionaryText = await readFile(dictionaryPath, "utf8")
const knowledgeCodes = new Set(
  JSON.parse(dictionaryText).knowledge_points.map(item => item.code)
)
const methodCodes = new Set(
  JSON.parse(dictionaryText).methods.map(item => item.code)
)

if (progress.in_progress !== null) {
  throw new Error("progress.in_progress 必须为 null，才能冻结入库批次")
}
if (progress.checkpoint?.approval?.status !== "approved_for_import") {
  throw new Error("当前 checkpoint 尚未记录 approved_for_import")
}

const questions = []
const collections = []
const externalIds = new Set()
const riskItems = []

for (const entry of progress.completed_collections) {
  const collectionPath = join(root, entry.file)
  const payload = await readJson(collectionPath)
  if (payload.collection.question_count !== payload.questions.length) {
    throw new Error(`${entry.file} 的声明题数与实际题数不一致`)
  }
  if (entry.question_count !== payload.questions.length) {
    throw new Error(`${entry.file} 与 progress.json 的题数不一致`)
  }

  const firstLine = questions.length + 1
  for (const question of payload.questions) {
    if (question.status !== "imported") {
      throw new Error(`${question.external_id} 的入库状态不是 imported`)
    }
    if (externalIds.has(question.external_id)) {
      throw new Error(`external_id 重复：${question.external_id}`)
    }
    externalIds.add(question.external_id)
    if (question.answers.filter(item => item.is_primary).length !== 1) {
      throw new Error(`${question.external_id} 的主答案数量不是 1`)
    }
    if (question.solutions.filter(item => item.is_primary).length !== 1) {
      throw new Error(`${question.external_id} 的主解析数量不是 1`)
    }
    for (const label of question.knowledge_points) {
      if (!knowledgeCodes.has(label.code)) {
        throw new Error(
          `${question.external_id} 引用了未知知识点 ${label.code}`
        )
      }
    }
    for (const label of question.methods) {
      if (!methodCodes.has(label.code)) {
        throw new Error(`${question.external_id} 引用了未知方法 ${label.code}`)
      }
    }
    if (
      question.metadata?.ocr_quality === "ambiguous" ||
      question.metadata?.ocr_quality === "unusable"
    ) {
      riskItems.push({
        external_id: question.external_id,
        ocr_quality: question.metadata.ocr_quality,
        note: question.metadata.ocr_note
      })
    }
    questions.push(question)
  }
  collections.push({
    school: entry.school,
    year: entry.year,
    subject_code: entry.subject_code,
    source_file: entry.file,
    question_count: entry.question_count,
    jsonl_lines: {
      first: firstLine,
      last: questions.length
    }
  })
}

if (questions.length !== progress.checkpoint.completed_question_count) {
  throw new Error("冻结题数与 checkpoint 记录不一致")
}

const jsonlText =
  questions.map(question => JSON.stringify(question)).join("\n") + "\n"
const jsonlHash = sha256(jsonlText)
const batchKey = `tracetutor-curated-${jsonlHash.slice(0, 24)}`
const manifest = {
  schema_version: "1.0",
  batch_name: "TraceTutor 首批人工精标考研真题",
  batch_key: batchKey,
  created_at: progress.checkpoint.recorded_at,
  jsonl_file: jsonlName,
  jsonl_sha256: jsonlHash,
  tag_dictionary_file: "tag-dictionary.json",
  tag_dictionary_sha256: sha256(dictionaryText),
  collection_count: collections.length,
  question_count: questions.length,
  collections,
  approval: {
    status: "approved_for_import",
    source: "explicit_user_approval",
    scope: "all_questions_in_batch",
    approved_question_count: questions.length,
    approved_external_ids: questions.map(question => question.external_id),
    database_activation:
      "pending_pgsql_import_and_review_item_reconciliation",
    replay_instruction:
      "导入生成真实 question_id 与 review_item_id 后，按 external_id 对账，并通过 QuestionIngestionPort.applyReview 逐项执行 approve；不得直接更新为 active。"
  },
  risk_summary: {
    ambiguous_or_unusable_count: riskItems.length,
    items: riskItems
  }
}

await writeFile(join(root, jsonlName), jsonlText, "utf8")
await writeFile(
  join(root, manifestName),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
)

process.stdout.write(
  `${JSON.stringify({
    jsonl_file: jsonlName,
    manifest_file: manifestName,
    batch_key: batchKey,
    collections: collections.length,
    questions: questions.length,
    risks: riskItems.length
  })}\n`
)
