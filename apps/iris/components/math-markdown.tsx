import type { ReactNode } from "react"
import katex from "katex"

interface MathMarkdownProps {
  content: string
  className?: string
}

function normalizeMathDelimiters(raw: string): string {
  const escapedNewlines = (raw.match(/\\n/g) ?? []).length
  const realNewlines = (raw.match(/\n/g) ?? []).length
  let normalized =
    escapedNewlines >= 3 && realNewlines <= 1
      ? raw
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
      : raw

  const fenced = normalized.trim().match(/^```(?:markdown|md)\s*([\s\S]*?)```$/i)
  if (fenced) normalized = fenced[1]?.trim() ?? normalized

  const codeBlocks: string[] = []
  normalized = normalized.replace(/```[\s\S]*?```/g, block => {
    const token = `@@TRACETUTOR_CODE_${codeBlocks.length}@@`
    codeBlocks.push(block)
    return token
  })

  normalized = normalized
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression: string) => {
      const value = expression.trim()
      return value ? `\n$$\n${value}\n$$\n` : ""
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression: string) => {
      const value = expression.trim()
      return value ? `$${value}$` : ""
    })

  codeBlocks.forEach((block, index) => {
    normalized = normalized.replace(`@@TRACETUTOR_CODE_${index}@@`, block)
  })
  return normalized
}

function MathFormula({ expression, displayMode }: {
  expression: string
  displayMode: boolean
}) {
  let html: string
  try {
    html = katex.renderToString(expression, {
      displayMode,
      output: "htmlAndMathml",
      strict: "warn",
      throwOnError: false,
      trust: false
    })
  } catch {
    return <code className="math-error">{expression}</code>
  }

  const Element = displayMode ? "div" : "span"
  return (
    <Element
      className={displayMode ? "math-formula-display" : "math-formula-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function renderInline(source: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\$[^$\n]+\$|`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${match.index}`
    if (token.startsWith("$") && token.endsWith("$")) {
      nodes.push(<MathFormula displayMode={false} expression={token.slice(1, -1)} key={key} />)
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
      nodes.push(link ? (
        <a href={link[2]} key={key} rel="noreferrer" target="_blank">{link[1]}</a>
      ) : token)
    }
    cursor = match.index + token.length
  }

  if (cursor < source.length) nodes.push(source.slice(cursor))
  return nodes
}

function isBlockStart(line: string): boolean {
  const value = line.trim()
  return (
    !value || value === "$$" || value.startsWith("```") ||
    /^#{1,4}\s+/.test(value) || /^>\s?/.test(value) ||
    /^[-*]\s+/.test(value) || /^\d+[.)]\s+/.test(value)
  )
}

function renderBlocks(content: string): ReactNode[] {
  let normalized = normalizeMathDelimiters(content)
  const fencedCode: string[] = []
  normalized = normalized.replace(/```[\s\S]*?```/g, block => {
    const token = `@@TRACETUTOR_FENCED_CODE_${fencedCode.length}@@`
    fencedCode.push(block)
    return token
  })

  const displayMath: string[] = []
  normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (_, expression: string) => {
    const token = `@@TRACETUTOR_DISPLAY_MATH_${displayMath.length}@@`
    displayMath.push(expression.trim())
    return `\n${token}\n`
  })

  fencedCode.forEach((block, codeIndex) => {
    normalized = normalized.replace(`@@TRACETUTOR_FENCED_CODE_${codeIndex}@@`, block)
  })

  const lines = normalized.split("\n")
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ""
    const trimmed = line.trim()
    if (!trimmed) {
      index += 1
      continue
    }

    const displayToken = trimmed.match(/^@@TRACETUTOR_DISPLAY_MATH_(\d+)@@$/)
    if (displayToken) {
      const expressionIndex = Number(displayToken[1])
      blocks.push(
        <MathFormula
          displayMode
          expression={displayMath[expressionIndex] ?? ""}
          key={`math-${index}`}
        />
      )
      index += 1
      continue
    }

    if (trimmed === "$$") {
      const expression: string[] = []
      index += 1
      while (index < lines.length && lines[index]?.trim() !== "$$") {
        expression.push(lines[index] ?? "")
        index += 1
      }
      index += 1
      blocks.push(
        <MathFormula
          displayMode
          expression={expression.join("\n").trim()}
          key={`math-${index}`}
        />
      )
      continue
    }

    const singleDisplay = trimmed.match(/^\$\$([\s\S]+)\$\$$/)
    if (singleDisplay) {
      blocks.push(
        <MathFormula displayMode expression={singleDisplay[1]?.trim() ?? ""} key={`math-${index}`} />
      )
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index]?.trim().startsWith("```")) {
        code.push(lines[index] ?? "")
        index += 1
      }
      index += 1
      blocks.push(
        <pre key={`code-${index}`}><code className={language ? `language-${language}` : undefined}>{code.join("\n")}</code></pre>
      )
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1]?.length ?? 3
      const children = renderInline(heading[2] ?? "", `heading-${index}`)
      blocks.push(
        level === 1 ? <h1 key={`heading-${index}`}>{children}</h1> :
        level === 2 ? <h2 key={`heading-${index}`}>{children}</h2> :
        level === 3 ? <h3 key={`heading-${index}`}>{children}</h3> :
        <h4 key={`heading-${index}`}>{children}</h4>
      )
      index += 1
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index]?.trim() ?? "")) {
        quote.push((lines[index] ?? "").trim().replace(/^>\s?/, ""))
        index += 1
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(" "), `quote-${index}`)}</blockquote>)
      continue
    }

    const unordered = /^[-*]\s+/.test(trimmed)
    const ordered = /^\d+[.)]\s+/.test(trimmed)
    if (unordered || ordered) {
      const items: ReactNode[] = []
      const itemPattern = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/
      while (index < lines.length && itemPattern.test(lines[index]?.trim() ?? "")) {
        const item = (lines[index] ?? "").trim().replace(itemPattern, "")
        items.push(<li key={`item-${index}`}>{renderInline(item, `item-${index}`)}</li>)
        index += 1
      }
      blocks.push(ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>)
      continue
    }

    const paragraph = [trimmed]
    index += 1
    while (index < lines.length && !isBlockStart(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim())
      index += 1
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(" "), `paragraph-${index}`)}</p>)
  }
  return blocks
}

export function MathMarkdown({ content, className = "" }: MathMarkdownProps) {
  return <div className={`math-markdown ${className}`.trim()}>{renderBlocks(content)}</div>
}
