import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime: ServerRuntime = "edge"

const DEFAULT_GPTSAPI_BASE_URL = "https://api.gptsapi.net/v1"
const GPTSAPI_MODEL_PREFIX = "gptsapi::"

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`
}

const normalizeModelId = (model: string) =>
  model.startsWith(GPTSAPI_MODEL_PREFIX)
    ? model.slice(GPTSAPI_MODEL_PREFIX.length)
    : model

const pickBaseUrlByModel = (params: {
  model: string
  defaultBaseUrl: string
  claudeBaseUrl?: string
  geminiBaseUrl?: string
}) => {
  const modelId = params.model.toLowerCase()

  if (modelId.startsWith("claude") && params.claudeBaseUrl) {
    return normalizeBaseUrl(params.claudeBaseUrl)
  }

  if (modelId.startsWith("gemini") && params.geminiBaseUrl) {
    return normalizeBaseUrl(params.geminiBaseUrl)
  }

  return normalizeBaseUrl(params.defaultBaseUrl)
}

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  try {
    const profile = await getServerProfile()
    const apiKey = (profile as any).gptsapi_api_key
    const model = normalizeModelId(chatSettings.model as string)
    const baseUrl = pickBaseUrlByModel({
      model,
      defaultBaseUrl:
        (profile as any).gptsapi_base_url || DEFAULT_GPTSAPI_BASE_URL,
      claudeBaseUrl: (profile as any).gptsapi_claude_base_url || "",
      geminiBaseUrl: (profile as any).gptsapi_gemini_base_url || ""
    })

    checkApiKey(apiKey, "GPTSAPI")

    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl
    })

    const response = await openai.chat.completions.create({
      model: model as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      stream: true
    })

    const stream = OpenAIStream(response)

    return new StreamingTextResponse(stream)
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "GPTSAPI API Key not found. Please set it in your environment."
    } else if (errorCode === 401) {
      errorMessage = "GPTSAPI API Key is incorrect."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
