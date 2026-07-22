const FRONTMATTER_BOUNDARY = "---"

const parseScalar = (raw: string): unknown => {
  const value = raw.trim()
  if (!value) return ""
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value.replace(/^["']|["']$/g, "")
}

export interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>
  body: string
}

export const parseFrontmatter = (markdown: string): FrontmatterParseResult => {
  const normalized = markdown.replace(/\r\n/g, "\n")
  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return { frontmatter: {}, body: normalized }
  }

  const closingIndex = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`)
  if (closingIndex === -1) {
    return { frontmatter: {}, body: normalized }
  }

  const rawFrontmatter = normalized
    .slice(FRONTMATTER_BOUNDARY.length + 1, closingIndex)
    .split("\n")
  const body = normalized.slice(closingIndex + FRONTMATTER_BOUNDARY.length + 2)

  const frontmatter: Record<string, unknown> = {}
  let currentKey = ""

  for (const line of rawFrontmatter) {
    if (!line.trim()) continue

    const listItem = line.match(/^\s*-\s+(.*)$/)
    if (listItem && currentKey) {
      const existing = frontmatter[currentKey]
      if (Array.isArray(existing)) {
        existing.push(parseScalar(listItem[1]))
      } else {
        frontmatter[currentKey] = [parseScalar(listItem[1])]
      }
      continue
    }

    const keyValue = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!keyValue) continue

    const [, key, rawValue] = keyValue
    currentKey = key
    if (!rawValue.trim()) {
      frontmatter[key] = []
      continue
    }

    const arrayMatch = rawValue.match(/^\[(.*)\]$/)
    if (arrayMatch) {
      const items = arrayMatch[1]
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .map(parseScalar)
      frontmatter[key] = items
      continue
    }

    frontmatter[key] = parseScalar(rawValue)
  }

  return {
    frontmatter,
    body
  }
}
