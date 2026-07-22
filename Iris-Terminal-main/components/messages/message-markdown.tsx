import React, { FC } from "react"
import Image from "next/image"
import rehypeKatex from "rehype-katex"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { MessageCodeBlock } from "./message-codeblock"
import { MessageMarkdownMemoized } from "./message-markdown-memoized"

interface MessageMarkdownProps {
  content: string
}

const normalizeMathDelimiters = (raw: string) => {
  const normalizeEscapedMultilineText = (text: string) => {
    const escapedNewlineCount = (text.match(/\\n/g) || []).length
    const realNewlineCount = (text.match(/\n/g) || []).length

    // Some GPT-compatible backends return markdown as an escaped string.
    if (escapedNewlineCount >= 3 && realNewlineCount <= 1) {
      return text
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
    }

    return text
  }

  const unwrapMarkdownFence = (text: string) => {
    const trimmed = text.trim()
    const matched = trimmed.match(/^```(?:markdown|md)\s*([\s\S]*?)```$/i)
    if (matched) {
      return matched[1].trim()
    }

    return text
  }

  raw = unwrapMarkdownFence(normalizeEscapedMultilineText(raw))

  const codeBlockRegex = /```[\s\S]*?```/g
  let output = ""
  let lastIndex = 0

  const normalizeNonCodeText = (text: string) => {
    const normalizeLine = (line: string) => {
      const trimmedLine = line.trim()

      if (!trimmedLine) return line

      if (/^\d+\)\s+/.test(trimmedLine)) {
        return trimmedLine.replace(/^(\d+)\)\s+/, "$1. ")
      }
      if (/^\d+）\s+/.test(trimmedLine)) {
        return trimmedLine.replace(/^(\d+)）\s+/, "$1. ")
      }
      if (/^[•·]\s+/.test(trimmedLine)) {
        return trimmedLine.replace(/^[•·]\s+/, "- ")
      }

      const headingMatch = trimmedLine.match(/^(.{2,40})[：:]$/)
      if (
        headingMatch &&
        !/^[\-\*\d]/.test(trimmedLine) &&
        !/[=<>$`]/.test(trimmedLine)
      ) {
        return `### ${headingMatch[1].trim()}`
      }

      return line
    }

    const dollar = "$"
    const withMath = text
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, expr: string) => {
        const value = expr.trim()
        return value
          ? `\n${dollar}${dollar}\n${value}\n${dollar}${dollar}\n`
          : ""
      })
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, expr: string) => {
        const value = expr.trim()
        return value ? `${dollar}${value}${dollar}` : ""
      })

    return withMath.split("\n").map(normalizeLine).join("\n")
  }

  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(raw)) !== null) {
    output += normalizeNonCodeText(raw.slice(lastIndex, match.index))
    output += match[0]
    lastIndex = match.index + match[0].length
  }

  output += normalizeNonCodeText(raw.slice(lastIndex))
  return output
}

export const MessageMarkdown: FC<MessageMarkdownProps> = ({ content }) => {
  const normalizedContent = normalizeMathDelimiters(content)

  return (
    <MessageMarkdownMemoized
      className="prose prose-neutral dark:prose-invert prose-p:leading-7 prose-headings:scroll-mt-24 prose-headings:font-semibold prose-a:break-all prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none min-w-full space-y-6 break-words"
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>
        },
        img({ node, ...props }) {
          const src = typeof props.src === "string" ? props.src : ""
          if (!src) return null

          return (
            <Image
              className="max-w-[67%] rounded"
              alt={props.alt || ""}
              src={src}
              width={1200}
              height={900}
              style={{ height: "auto" }}
              unoptimized
            />
          )
        },
        code({ node, className, children, ...props }) {
          const childArray = React.Children.toArray(children)
          const firstChild = childArray[0] as React.ReactElement
          const firstChildAsString = React.isValidElement(firstChild)
            ? (firstChild as React.ReactElement).props.children
            : firstChild

          if (firstChildAsString === "▍") {
            return <span className="mt-1 animate-pulse cursor-default">▍</span>
          }

          if (typeof firstChildAsString === "string") {
            childArray[0] = firstChildAsString.replace("`▍`", "▍")
          }

          const match = /language-(\w+)/.exec(className || "")

          if (
            typeof firstChildAsString === "string" &&
            !firstChildAsString.includes("\n")
          ) {
            return (
              <code className={className} {...props}>
                {childArray}
              </code>
            )
          }

          return (
            <MessageCodeBlock
              key={Math.random()}
              language={(match && match[1]) || ""}
              value={String(childArray).replace(/\n$/, "")}
              {...props}
            />
          )
        }
      }}
    >
      {normalizedContent}
    </MessageMarkdownMemoized>
  )
}
