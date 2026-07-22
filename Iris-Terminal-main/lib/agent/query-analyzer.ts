import type { ChatMode, QueryAnalysis } from "@/lib/knowledge/types"

interface AnalyzeQueryInput {
  query: string
  mode?: ChatMode
  topK?: number
}

const STRONG_RETRIEVAL_HINTS = [
  /我的笔记/i,
  /obsidian/i,
  /vault/i,
  /之前(讨论|说|提到)/i,
  /(项目|project).*(记录|笔记|总结|日志)/i,
  /(论文|paper).*(笔记|总结)/i,
  /(workspace|工作区).*(历史|内容|资料)/i
]

const WEAK_RETRIEVAL_HINTS = [
  /(文件|file).*(里|中|内容)/i,
  /(术语|名词|关键词).*(解释|来源)/i,
  /(上次|历史|以前).*(结论|结果|讨论)/i
]

const extractKeywords = (query: string) => {
  const quoted = Array.from(query.matchAll(/[“"]([^”"]+)[”"]/g)).map(
    item => item[1]
  )
  const lexical = query
    .split(/[\s,.;:!?，。；：！？、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
  return Array.from(new Set([...quoted, ...lexical])).slice(0, 12)
}

export const analyzeQuery = ({
  query,
  mode = "auto",
  topK
}: AnalyzeQueryInput): QueryAnalysis => {
  const trimmed = query.trim()
  const keywords = extractKeywords(trimmed)

  if (mode === "chat_only") {
    return {
      query: trimmed,
      mode,
      shouldRetrieve: false,
      reason: "chat_only 模式禁用检索",
      strategy: "none",
      keywords,
      topK: 0
    }
  }

  if (mode === "grounded") {
    return {
      query: trimmed,
      mode,
      shouldRetrieve: true,
      reason: "grounded 模式强制检索",
      strategy: "hybrid_forced",
      keywords,
      topK: topK ?? 10
    }
  }

  const hasStrongHint = STRONG_RETRIEVAL_HINTS.some(pattern =>
    pattern.test(trimmed)
  )
  const hasWeakHint = WEAK_RETRIEVAL_HINTS.some(pattern => pattern.test(trimmed))
  const hasDomainToken = /[A-Za-z]+\d+|[A-Z]{2,}|[\u4e00-\u9fa5]{2,}[-_/][\u4e00-\u9fa5A-Za-z0-9]+/.test(
    trimmed
  )

  if (hasStrongHint || hasDomainToken) {
    return {
      query: trimmed,
      mode,
      shouldRetrieve: true,
      reason: hasStrongHint ? "命中强检索意图" : "命中领域术语特征",
      strategy: "hybrid_standard",
      keywords,
      topK: topK ?? 8
    }
  }

  if (hasWeakHint) {
    return {
      query: trimmed,
      mode,
      shouldRetrieve: true,
      reason: "命中弱检索意图，执行轻量检索",
      strategy: "hybrid_light",
      keywords,
      topK: topK ?? 5
    }
  }

  return {
    query: trimmed,
    mode,
    shouldRetrieve: false,
    reason: "自动模式判定为通用对话",
    strategy: "none",
    keywords,
    topK: 0
  }
}
