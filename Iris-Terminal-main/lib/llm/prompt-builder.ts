import type { ContextPacket } from "@/lib/knowledge/types"

interface BuildPromptInput {
  systemPrompt?: string
  context: ContextPacket
  userQuery: string
}

export const buildGroundedPrompt = ({
  systemPrompt,
  context,
  userQuery
}: BuildPromptInput) => {
  return [
    systemPrompt ??
      "你是 Iris-Terminal 助手。优先基于检索上下文作答，缺证据时明确说明。",
    "",
    context.text,
    "",
    "[Response Rules]",
    "1. 使用上下文时返回 source_id。",
    "2. 没有证据时明确说“未检索到可靠来源”。",
    "3. 保持回答简洁、可执行。",
    "",
    `[User Query]\n${userQuery}`
  ].join("\n")
}
