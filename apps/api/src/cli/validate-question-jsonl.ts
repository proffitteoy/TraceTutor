import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { questionJsonlSchema } from "../ingestion/contracts.js"

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function main(): Promise<void> {
  const file = valueAfter(process.argv.slice(2), "--file")
  if (!file) {
    throw new Error(
      "缺少 --file。示例：npm run questions:validate -- --file ./questions.jsonl"
    )
  }

  const absoluteFile = resolve(file)
  const content = await readFile(absoluteFile, "utf8")
  const lines = content
    .split(/\r?\n/)
    .map((rawText, index) => ({ rawText, lineNumber: index + 1 }))
    .filter(item => item.rawText.trim().length > 0)
  if (lines.length === 0) throw new Error("JSONL 文件没有题目")

  const externalIds = new Set<string>()
  const failures: Array<{
    line_number: number
    external_id?: string
    reason: string
  }> = []

  for (const line of lines) {
    let rawJson: unknown
    try {
      rawJson = JSON.parse(line.rawText)
    } catch {
      failures.push({
        line_number: line.lineNumber,
        reason: "不是合法 JSON"
      })
      continue
    }

    const parsed = questionJsonlSchema.safeParse(rawJson)
    if (!parsed.success) {
      failures.push({
        line_number: line.lineNumber,
        reason: parsed.error.issues
          .map(issue => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; ")
      })
      continue
    }
    if (externalIds.has(parsed.data.external_id)) {
      failures.push({
        line_number: line.lineNumber,
        external_id: parsed.data.external_id,
        reason: "external_id 在同一 JSONL 中重复"
      })
      continue
    }
    externalIds.add(parsed.data.external_id)
  }

  process.stdout.write(
    `${JSON.stringify({
      file: absoluteFile,
      lines: lines.length,
      valid: lines.length - failures.length,
      failed: failures.length,
      unique_external_ids: externalIds.size,
      failures
    })}\n`
  )
  if (failures.length > 0) process.exitCode = 2
}

await main()
