const EN_STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "that",
  "this",
  "have",
  "will",
  "your",
  "you",
  "for",
  "are",
  "was",
  "not",
  "can",
  "has",
  "had",
  "about",
  "into",
  "but",
  "use",
  "using"
])

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\u4e00-\u9fa5a-z0-9_\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export const extractSummaryKeywords = (text: string, maxCount = 6) => {
  const normalized = normalizeText(text)
  if (!normalized) return []

  const scoreMap = new Map<string, number>()

  const cjkTokens = normalized.match(/[\u4e00-\u9fa5]{2,8}/g) || []
  for (const token of cjkTokens) {
    scoreMap.set(token, (scoreMap.get(token) || 0) + 1.2)
  }

  const enTokens = normalized.match(/[a-z][a-z0-9_\-]{2,}/g) || []
  for (const token of enTokens) {
    if (EN_STOPWORDS.has(token)) continue
    scoreMap.set(token, (scoreMap.get(token) || 0) + 1)
  }

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, maxCount)
    .map(([keyword]) => keyword)
}

export const detectInputKeywords = (
  userInput: string,
  keywordPool: string[],
  maxCount = 8
) => {
  const normalizedInput = normalizeText(userInput)
  if (!normalizedInput) return []

  const hits = keywordPool
    .filter(
      keyword => keyword && normalizedInput.includes(keyword.toLowerCase())
    )
    .sort((a, b) => b.length - a.length)

  return Array.from(new Set(hits)).slice(0, maxCount)
}

export const keywordMatchScore = (userInput: string, summaryText: string) => {
  const summaryKeywords = extractSummaryKeywords(summaryText, 10)
  if (summaryKeywords.length === 0) return 0

  const hits = detectInputKeywords(userInput, summaryKeywords, 10)
  if (hits.length === 0) return 0

  return hits.length / summaryKeywords.length
}
