export type NoteLinkType = "wiki" | "markdown" | "heading" | "block"

export interface ExtractedNoteLink {
  target_path: string
  link_text?: string
  link_type: NoteLinkType
}

export interface ExtractedMetadata {
  aliases: string[]
  tags: string[]
  links: ExtractedNoteLink[]
}

const dedupe = (items: string[]) => Array.from(new Set(items.filter(Boolean)))

const normalizeLinkTarget = (raw: string) => {
  let value = raw.trim()
  if (!value) return value
  value = value.replace(/\\/g, "/")
  return value
}

const pickLinkType = (target: string): NoteLinkType => {
  if (target.includes("#")) return "heading"
  if (target.includes("^")) return "block"
  return "wiki"
}

const extractAliases = (frontmatter: Record<string, unknown>) => {
  const aliasesValue = frontmatter.aliases
  if (!aliasesValue) return []
  if (typeof aliasesValue === "string") return dedupe([aliasesValue])
  if (Array.isArray(aliasesValue)) {
    return dedupe(
      aliasesValue
        .map(item => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  }
  return []
}

const extractTagsFromFrontmatter = (frontmatter: Record<string, unknown>) => {
  const tagsValue = frontmatter.tags
  if (!tagsValue) return []
  if (typeof tagsValue === "string") return dedupe([tagsValue])
  if (Array.isArray(tagsValue)) {
    return dedupe(
      tagsValue
        .map(item => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  }
  return []
}

const extractTagsFromBody = (content: string) => {
  const tags: string[] = []
  const regex = /(^|\s)#([\p{L}\p{N}_/-]+)/gu
  let match: RegExpExecArray | null = regex.exec(content)
  while (match) {
    tags.push(match[2])
    match = regex.exec(content)
  }
  return tags
}

export const extractNoteMetadata = (
  content: string,
  frontmatter: Record<string, unknown>
): ExtractedMetadata => {
  const links: ExtractedNoteLink[] = []

  const wikiLinkRegex = /\[\[([^[\]]+)\]\]/g
  let wikiMatch = wikiLinkRegex.exec(content)
  while (wikiMatch) {
    const raw = wikiMatch[1]
    const [target, text] = raw.split("|")
    const normalizedTarget = normalizeLinkTarget(target)
    if (normalizedTarget) {
      links.push({
        target_path: normalizedTarget,
        link_text: text?.trim(),
        link_type: pickLinkType(normalizedTarget)
      })
    }
    wikiMatch = wikiLinkRegex.exec(content)
  }

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  let markdownMatch = markdownLinkRegex.exec(content)
  while (markdownMatch) {
    const label = markdownMatch[1].trim()
    const target = markdownMatch[2].trim()
    if (!target || /^https?:\/\//i.test(target)) {
      markdownMatch = markdownLinkRegex.exec(content)
      continue
    }
    links.push({
      target_path: normalizeLinkTarget(target),
      link_text: label,
      link_type: target.includes("#") ? "heading" : "markdown"
    })
    markdownMatch = markdownLinkRegex.exec(content)
  }

  return {
    aliases: extractAliases(frontmatter),
    tags: dedupe([
      ...extractTagsFromFrontmatter(frontmatter),
      ...extractTagsFromBody(content)
    ]),
    links
  }
}
