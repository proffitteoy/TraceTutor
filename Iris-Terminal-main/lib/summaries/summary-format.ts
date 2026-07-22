import { extractSummaryKeywords } from "@/lib/summaries/keywords"

const KEYWORD_SPLIT_REGEX = /[\s,，、;；|]+/
const MAX_SUMMARY_LENGTH = 280

const normalizeParagraph = (text: string) => {
  const compact = text
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  if (compact.length <= MAX_SUMMARY_LENGTH) return compact
  return `${compact.slice(0, MAX_SUMMARY_LENGTH)}...`
}

const normalizeKeywords = (raw: string, maxCount: number) => {
  const keywords = raw
    .split(KEYWORD_SPLIT_REGEX)
    .map(item => item.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)

  return Array.from(new Set(keywords)).slice(0, maxCount)
}

const getKeywordBlock = (summaryText: string) => {
  const inlineMatch = summaryText.match(
    /(?:^|\n)\s*\u5173\u952e\u8bcd\s*[:\uff1a]\s*([^\n]+)/
  )
  if (inlineMatch?.[1]) return inlineMatch[1]

  const blockMatch = summaryText.match(
    /\u3010\u5173\u952e\u8bcd\u3011\s*\n([^\n]+)/
  )
  if (blockMatch?.[1]) return blockMatch[1]

  return ""
}

const getSummaryBlock = (summaryText: string) => {
  const inlineMatch = summaryText.match(
    /(?:^|\n)\s*\u603b\u7ed3\s*[:\uff1a]\s*([\s\S]*)$/
  )
  if (inlineMatch?.[1]) return inlineMatch[1]

  const coreBlock = summaryText.match(
    /\u3010\u6838\u5fc3\u7ed3\u8bba\u3011\s*([\s\S]*?)(?:\n\u3010|$)/
  )
  if (coreBlock?.[1]) return coreBlock[1]

  return summaryText
}

export const extractStructuredKeywords = (
  summaryText: string,
  maxCount = 3
) => {
  const keywordBlock = getKeywordBlock(summaryText)
  const fromStructured = keywordBlock
    ? normalizeKeywords(keywordBlock, maxCount)
    : []

  if (fromStructured.length >= maxCount) {
    return fromStructured.slice(0, maxCount)
  }

  const fromStat = extractSummaryKeywords(summaryText, maxCount)
  return Array.from(new Set([...fromStructured, ...fromStat])).slice(
    0,
    maxCount
  )
}

export const normalizeSummaryText = (
  rawSummary: string,
  conversationText: string
) => {
  const summaryBlock = normalizeParagraph(getSummaryBlock(rawSummary))
  const fallbackSummary = normalizeParagraph(conversationText)
  const finalSummary =
    summaryBlock ||
    fallbackSummary ||
    "\u6682\u65e0\u53ef\u7528\u603b\u7ed3\u3002"

  const keywords = extractStructuredKeywords(
    `${rawSummary}\n${conversationText}`,
    3
  )
  const finalKeywords = [...keywords]

  while (finalKeywords.length < 3) {
    finalKeywords.push(`\u5173\u952e\u8bcd${finalKeywords.length + 1}`)
  }

  return `\u5173\u952e\u8bcd\uff1a${finalKeywords.slice(0, 3).join("\uff0c")}\n\u603b\u7ed3\uff1a${finalSummary}`
}
