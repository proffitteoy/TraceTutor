import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism"

interface MessageCodeBlockHighlighterProps {
  language: string
  value: string
}

export const MessageCodeBlockHighlighter = ({
  language,
  value
}: MessageCodeBlockHighlighterProps) => (
  <SyntaxHighlighter
    language={language}
    style={oneDark}
    customStyle={{
      margin: 0,
      width: "100%",
      background: "transparent"
    }}
    codeTagProps={{
      style: {
        fontSize: "14px",
        fontFamily: "var(--font-mono)"
      }
    }}
  >
    {value}
  </SyntaxHighlighter>
)
