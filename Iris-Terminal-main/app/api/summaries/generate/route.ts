import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { normalizeSummaryText } from "@/lib/summaries/summary-format"
import {
  buildSummaryUserPrompt,
  SUMMARY_SYSTEM_PROMPT
} from "@/lib/summaries/summary-prompts"
import { encode } from "gpt-tokenizer"
import OpenAI from "openai"

const DEFAULT_SUMMARY_MODEL = "deepseek-chat"
const FALLBACK_SUMMARY_MODELS = ["deepseek-chat", "deepseek-reasoner"]
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
const DEFAULT_SUMMARY_TEMPERATURE = 0.2
const MAX_SUMMARY_INPUT_TOKENS = 6000
const SUMMARY_MIN_MESSAGES = Number(process.env.SUMMARY_MIN_MESSAGES || 8)
const SUMMARY_MIN_TOKENS = Number(process.env.SUMMARY_MIN_TOKENS || 600)
const SUMMARY_COMPLEX_MIN_TOKENS = Number(
  process.env.SUMMARY_COMPLEX_MIN_TOKENS || 350
)

const COMPLEXITY_REGEX =
  /```|代码|排查|调试|错误|异常|性能|架构|方案|接口|数据库|脚本|部署|测试|优化|api|sql|stack|trace|exception|debug|algorithm|bug/gi

const buildConversationText = (
  messages: { role: string; content: string }[]
) => {
  const lines = messages.map(message => `${message.role}: ${message.content}`)

  let usedTokens = 0
  const selected: string[] = []

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const tokens = encode(line).length

    if (usedTokens + tokens > MAX_SUMMARY_INPUT_TOKENS) break

    usedTokens += tokens
    selected.unshift(line)
  }

  return selected.join("\n")
}

const getConversationStats = (
  messages: { role: string; content: string }[]
) => {
  const lines = messages.map(message => `${message.role}: ${message.content}`)
  const joined = lines.join("\n")
  const totalTokens = lines.reduce((acc, line) => acc + encode(line).length, 0)
  const userTurns = messages.filter(message => message.role === "user").length
  const assistantTurns = messages.filter(
    message => message.role === "assistant"
  ).length
  const complexityMatches = joined.match(COMPLEXITY_REGEX) || []

  return {
    messageCount: messages.length,
    totalTokens,
    userTurns,
    assistantTurns,
    complexitySignals: complexityMatches.length
  }
}

const shouldGenerateSummary = (
  stats: ReturnType<typeof getConversationStats>
) => {
  if (
    stats.messageCount >= SUMMARY_MIN_MESSAGES &&
    stats.totalTokens >= SUMMARY_MIN_TOKENS
  ) {
    return true
  }

  if (stats.totalTokens >= SUMMARY_MIN_TOKENS * 1.6) {
    return true
  }

  if (
    stats.totalTokens >= SUMMARY_COMPLEX_MIN_TOKENS &&
    stats.complexitySignals >= 2 &&
    stats.userTurns >= 2 &&
    stats.assistantTurns >= 2
  ) {
    return true
  }

  return false
}

const createSummaryClient = () => {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || ""
  const deepseekBaseUrl =
    process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL

  checkApiKey(deepseekApiKey, "DeepSeek")

  return new OpenAI({
    apiKey: deepseekApiKey,
    baseURL: deepseekBaseUrl
  })
}

const isModelNotExistError = (error: any) => {
  const message =
    `${error?.error?.message || error?.message || ""}`.toLowerCase()
  if (!message.includes("model")) return false

  return (
    message.includes("not exist") ||
    message.includes("not found") ||
    message.includes("invalid") ||
    message.includes("unknown")
  )
}

const buildSummaryModelCandidates = (summaryModel: string) => {
  const candidates = [summaryModel, ...FALLBACK_SUMMARY_MODELS]

  return Array.from(
    new Set(
      candidates
        .map(item => item.trim())
        .filter(item => item.toLowerCase().startsWith("deepseek"))
    )
  )
}

export async function POST(request: Request) {
  const json = await request.json()
  const { chatId } = json as { chatId: string }

  if (!chatId) {
    return new Response(JSON.stringify({ message: "chatId is required" }), {
      status: 400
    })
  }

  try {
    const { user } = await ensureLocalBootstrap()

    const chat = await prisma.chat.findUnique({ where: { id: chatId } })

    if (!chat) {
      return new Response(JSON.stringify({ message: "Chat not found" }), {
        status: 404
      })
    }

    if (chat.user_id !== user.id) {
      return new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403
      })
    }

    const messages = await prisma.message.findMany({
      where: { chat_id: chatId },
      orderBy: { sequence_number: "asc" },
      select: { role: true, content: true }
    })

    const workspace = await prisma.workspace.findUnique({
      where: { id: chat.workspace_id },
      select: { embeddings_provider: true }
    })

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No messages to summarize" }),
        {
          status: 400
        }
      )
    }

    const stats = getConversationStats(messages)
    if (!shouldGenerateSummary(stats)) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "short_or_simple",
          message: "对话较短或较简单，未纳入总结。"
        }),
        {
          status: 200
        }
      )
    }

    const profile = await getServerProfile()

    const configuredSummaryModel = (process.env.SUMMARY_MODEL || "").trim()
    const summaryModel =
      configuredSummaryModel &&
      configuredSummaryModel.toLowerCase().startsWith("deepseek")
        ? configuredSummaryModel
        : DEFAULT_SUMMARY_MODEL

    const conversationText = buildConversationText(messages)
    const modelCandidates = buildSummaryModelCandidates(summaryModel)

    let summaryText = ""
    let usedSummaryModel = "deepseek-fallback"
    let lastModelError: any = null
    let chatClient: OpenAI | null = null

    try {
      chatClient = createSummaryClient()
      usedSummaryModel = summaryModel
    } catch (error: any) {
      lastModelError = error
      chatClient = null
    }

    if (chatClient) {
      for (const modelCandidate of modelCandidates) {
        try {
          const summaryResponse = await chatClient.chat.completions.create({
            model: modelCandidate as any,
            messages: [
              { role: "system", content: SUMMARY_SYSTEM_PROMPT },
              {
                role: "user",
                content: buildSummaryUserPrompt(conversationText)
              }
            ],
            temperature: DEFAULT_SUMMARY_TEMPERATURE
          })

          const candidateText =
            summaryResponse.choices?.[0]?.message?.content?.trim() || ""

          if (candidateText) {
            summaryText = normalizeSummaryText(candidateText, conversationText)
            usedSummaryModel = modelCandidate
            break
          }
        } catch (error: any) {
          lastModelError = error

          if (isModelNotExistError(error)) {
            continue
          }

          continue
        }
      }
    }

    if (!summaryText) {
      summaryText = normalizeSummaryText("", conversationText)
      usedSummaryModel = lastModelError ? "deepseek-fallback" : "local-fallback"
    }

    let openai_embedding: number[] | null = null
    let local_embedding: number[] | null = null
    const embeddingWarnings: string[] = []

    let embeddingsProvider =
      (workspace?.embeddings_provider as "openai" | "local") || "openai"

    const hasOpenAIEmbeddingKey = profile.use_azure_openai
      ? Boolean(
          profile.azure_openai_api_key && profile.azure_openai_embeddings_id
        )
      : Boolean(profile.openai_api_key)

    if (embeddingsProvider === "openai" && !hasOpenAIEmbeddingKey) {
      embeddingsProvider = "local"
    }

    if (embeddingsProvider === "openai") {
      try {
        let embeddingClient: OpenAI

        if (profile.use_azure_openai) {
          embeddingClient = new OpenAI({
            apiKey: profile.azure_openai_api_key || "",
            baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
            defaultQuery: { "api-version": "2023-12-01-preview" },
            defaultHeaders: { "api-key": profile.azure_openai_api_key }
          })
        } else {
          embeddingClient = new OpenAI({
            apiKey: profile.openai_api_key || "",
            organization: profile.openai_organization_id
          })
        }

        const embeddingResponse = await embeddingClient.embeddings.create({
          model: "text-embedding-3-small",
          input: summaryText
        })

        openai_embedding = embeddingResponse.data.map(item => item.embedding)[0]
      } catch (error: any) {
        const errorMessage =
          error?.error?.message || error?.message || "OpenAI embedding failed"
        embeddingWarnings.push(errorMessage)
        console.warn(
          "[summaries.generate] OpenAI embedding failed:",
          errorMessage
        )
        embeddingsProvider = "local"
      }
    }

    if (embeddingsProvider === "local" && !local_embedding) {
      try {
        local_embedding = await generateLocalEmbedding(summaryText)
      } catch (error: any) {
        const errorMessage =
          error?.error?.message || error?.message || "Local embedding failed"
        embeddingWarnings.push(errorMessage)
        console.warn(
          "[summaries.generate] Local embedding failed:",
          errorMessage
        )
      }
    }

    const summaryRow = await prisma.chatSummary.upsert({
      where: { chat_id: chat.id },
      update: {
        status: "completed",
        model: usedSummaryModel,
        summary: summaryText,
        openai_embedding: openai_embedding as any,
        local_embedding: local_embedding as any
      },
      create: {
        chat_id: chat.id,
        user_id: user.id,
        workspace_id: chat.workspace_id,
        status: "completed",
        model: usedSummaryModel,
        summary: summaryText,
        openai_embedding: openai_embedding as any,
        local_embedding: local_embedding as any
      }
    })

    return new Response(
      JSON.stringify({
        summary: summaryRow,
        warning:
          embeddingWarnings.length > 0
            ? "总结已生成，但向量索引构建失败，本次不影响总结保存。"
            : null
      }),
      {
        status: 200
      }
    )
  } catch (error: any) {
    const errorMessage = error?.error?.message || error?.message || "Failed"
    const errorCode = error?.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
