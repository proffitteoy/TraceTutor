import path from "path"

export interface MarkdownSection {
  heading_path: string[]
  content: string
  start_line: number
  end_line: number
}

export interface ParsedMarkdownNote {
  title: string
  sections: MarkdownSection[]
}

const HEADING_REGEX = /^(#{1,6})\s+(.*)$/

const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, " ")

export const parseMarkdownNote = (
  content: string,
  relativePath: string
): ParsedMarkdownNote => {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const sections: MarkdownSection[] = []
  const headingStack: string[] = []
  let activeStartLine = 1
  let activeHeadingPath: string[] = []
  let buffer: string[] = []
  let title = ""

  const flush = (endLine: number) => {
    const sectionContent = buffer.join("\n").trim()
    if (!sectionContent) {
      buffer = []
      activeStartLine = endLine + 1
      return
    }

    sections.push({
      heading_path: [...activeHeadingPath],
      content: sectionContent,
      start_line: activeStartLine,
      end_line: endLine
    })
    buffer = []
    activeStartLine = endLine + 1
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const headingMatch = line.match(HEADING_REGEX)
    if (!headingMatch) {
      buffer.push(line)
      return
    }

    flush(lineNumber - 1)

    const level = headingMatch[1].length
    const heading = normalizeTitle(headingMatch[2])
    if (!title && level === 1 && heading) {
      title = heading
    }

    while (headingStack.length >= level) {
      headingStack.pop()
    }
    headingStack.push(heading)
    activeHeadingPath = [...headingStack]
    activeStartLine = lineNumber + 1
  })

  flush(lines.length)

  if (!title) {
    const basename = path.basename(relativePath, path.extname(relativePath))
    title = basename || "Untitled Note"
  }

  if (sections.length === 0) {
    sections.push({
      heading_path: [],
      content: content.trim(),
      start_line: 1,
      end_line: lines.length
    })
  }

  return {
    title,
    sections
  }
}
