import { cosineSimilarity } from "@/lib/cosine-similarity"
import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import { prisma } from "@/lib/prisma"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Prisma } from "@prisma/client"
import OpenAI from "openai"

const hasOpenAIEmbeddingKey = (
  profile: Awaited<ReturnType<typeof getServerProfile>>
) =>
  profile.use_azure_openai
    ? Boolean(
        profile.azure_openai_api_key && profile.azure_openai_embeddings_id
      )
    : Boolean(profile.openai_api_key)

const createOpenAIEmbeddingClient = (
  profile: Awaited<ReturnType<typeof getServerProfile>>
) => {
  if (profile.use_azure_openai) {
    return new OpenAI({
      apiKey: profile.azure_openai_api_key || "",
      baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
      defaultQuery: { "api-version": "2023-12-01-preview" },
      defaultHeaders: { "api-key": profile.azure_openai_api_key }
    })
  }

  return new OpenAI({
    apiKey: profile.openai_api_key || "",
    organization: profile.openai_organization_id
  })
}

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim()

const lexicalScore = (query: string, text: string) => {
  const q = normalizeText(query)
  const t = normalizeText(text)
  if (!q || !t) return 0

  let score = t.includes(q) ? 1 : 0
  const parts = q
    .split(/[\s,.;:!?，。；：！？、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)

  if (parts.length === 0) return score

  let hits = 0
  for (const part of parts) {
    if (t.includes(part)) hits += 1
  }

  score += hits / parts.length
  return score
}

const MIN_SIMILARITY_BY_PROVIDER = {
  openai: 0.2,
  local: 0.18,
  lexical: 0.35
} as const

export async function POST(request: Request) {
  const json = await request.json()
  const { userInput, embeddingsProvider, matchCount } = json as {
    userInput: string
    workspaceId?: string
    embeddingsProvider: "openai" | "local"
    matchCount?: number
  }

  if (!userInput?.trim()) {
    return new Response(JSON.stringify({ message: "userInput is required" }), {
      status: 400
    })
  }

  try {
    const profile = await getServerProfile()
    let usedProvider: "openai" | "local" | "lexical" = embeddingsProvider
    const results: Array<Record<string, any>> = []

    if (usedProvider === "openai" && !hasOpenAIEmbeddingKey(profile)) {
      usedProvider = "local"
    }

    if (usedProvider === "openai") {
      try {
        const [openai, openaiRows] = await Promise.all([
          createOpenAIEmbeddingClient(profile),
          prisma.chatSummary.findMany({
            where: {
              user_id: profile.user_id,
              status: "completed",
              openai_embedding: { not: Prisma.AnyNull }
            },
            select: {
              id: true,
              chat_id: true,
              workspace_id: true,
              summary: true,
              model: true,
              openai_embedding: true
            }
          })
        ])

        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: userInput
        })

        const openaiEmbedding = response.data.map(item => item.embedding)[0]
        results.push(
          ...openaiRows
            .filter(item => Array.isArray(item.openai_embedding))
            .map(item => ({
              ...item,
              similarity: cosineSimilarity(
                openaiEmbedding as number[],
                item.openai_embedding as number[]
              )
            }))
        )
      } catch {
        usedProvider = "local"
      }
    }

    if (usedProvider === "local" && results.length === 0) {
      try {
        const [localEmbedding, localRows] = await Promise.all([
          generateLocalEmbedding(userInput),
          prisma.chatSummary.findMany({
            where: {
              user_id: profile.user_id,
              status: "completed",
              local_embedding: { not: Prisma.AnyNull }
            },
            select: {
              id: true,
              chat_id: true,
              workspace_id: true,
              summary: true,
              model: true,
              local_embedding: true
            }
          })
        ])

        results.push(
          ...localRows
            .filter(item => Array.isArray(item.local_embedding))
            .map(item => ({
              ...item,
              similarity: cosineSimilarity(
                localEmbedding as number[],
                item.local_embedding as number[]
              )
            }))
        )
      } catch {
        usedProvider = "lexical"
      }
    }

    if (results.length === 0) {
      usedProvider = "lexical"
      const lexicalRows = await prisma.chatSummary.findMany({
        where: {
          user_id: profile.user_id,
          status: "completed"
        },
        select: {
          id: true,
          chat_id: true,
          workspace_id: true,
          summary: true,
          model: true
        }
      })
      results.push(
        ...lexicalRows.map(item => ({
          ...item,
          similarity: lexicalScore(userInput, item.summary || "")
        }))
      )
    }

    const sorted = results.sort((a, b) => b.similarity - a.similarity)
    const topScore = sorted[0]?.similarity ?? 0
    const minScore = MIN_SIMILARITY_BY_PROVIDER[usedProvider] ?? 0
    const relativeFloor =
      usedProvider === "lexical" ? topScore * 0.5 : topScore * 0.75

    const mostSimilar = sorted
      .filter(
        item => item.similarity >= minScore && item.similarity >= relativeFloor
      )
      .slice(0, matchCount || 4)

    return new Response(
      JSON.stringify({
        results: mostSimilar,
        provider: usedProvider
      }),
      {
        status: 200
      }
    )
  } catch (error: any) {
    const errorMessage =
      error?.error?.message ||
      error?.message ||
      "\u8bb0\u5fc6\u68c0\u7d22\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
    const errorCode = error?.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
