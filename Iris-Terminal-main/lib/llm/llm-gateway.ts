import type { ContextPacket } from "@/lib/knowledge/types"

interface GenerateAnswerInput {
  userQuery: string
  mode: "auto" | "chat_only" | "grounded"
  context: ContextPacket
}

const summarizeFromSources = (context: ContextPacket) => {
  if (context.sources.length === 0) {
    return "未检索到可靠来源，当前回答仅基于通用推断。"
  }

  const bullets = context.sources
    .slice(0, 3)
    .map(source => `- ${source.title}: ${source.excerpt}`)
    .join("\n")

  return `基于已检索到的笔记片段，当前可确认信息如下：\n${bullets}`
}

export const generateAnswerFromContext = async ({
  userQuery,
  mode,
  context
}: GenerateAnswerInput) => {
  if (mode === "chat_only") {
    return "Chat Only 模式未启用知识检索，请直接调用对应模型聊天接口。"
  }

  const evidenceText = summarizeFromSources(context)

  return `${evidenceText}\n\n问题：${userQuery}`
}
