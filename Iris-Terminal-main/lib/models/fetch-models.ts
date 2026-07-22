import { Tables } from "@/types/database"
import { LLM, LLMID, OpenRouterLLM } from "@/types"
import { toast } from "sonner"
import { LLM_LIST_MAP } from "./llm/llm-list"

const GPTSAPI_MODEL_PREFIX = "gptsapi::"
const GPTSAPI_PLATFORM_LINK = "https://api.gptsapi.net"

const NON_CHAT_MODEL_PATTERN = /(?:embedding|whisper|tts|dall-e|gpt-image|veo)/i
const IMAGE_MODEL_PATTERN =
  /(?:vision|image|gpt-4o|gpt-5|gemini|claude|grok|o1|o3|o4)/i

const toGptsapiModelId = (modelId: string) =>
  `${GPTSAPI_MODEL_PREFIX}${modelId}` as LLMID

const isLikelyChatModel = (modelId: string) =>
  !NON_CHAT_MODEL_PATTERN.test(modelId)

const isLikelyImageModel = (modelId: string) =>
  !NON_CHAT_MODEL_PATTERN.test(modelId) && IMAGE_MODEL_PATTERN.test(modelId)

export const fetchHostedModels = async (profile: Tables<"profiles">) => {
  try {
    const providers = [
      "google",
      "anthropic",
      "mistral",
      "groq",
      "perplexity",
      "deepseek",
      "gptsapi"
    ]

    if (profile.use_azure_openai) {
      providers.push("azure")
    } else {
      providers.push("openai")
    }

    const response = await fetch("/api/keys")

    if (!response.ok) {
      throw new Error(`Server is not responding.`)
    }

    const data = await response.json()

    let modelsToAdd: LLM[] = []

    for (const provider of providers) {
      let hasProfileKey = false

      if (provider === "google") {
        hasProfileKey = Boolean(profile.google_gemini_api_key)
      } else if (provider === "azure") {
        hasProfileKey = Boolean(profile.azure_openai_api_key)
      } else if (provider === "deepseek") {
        hasProfileKey = Boolean((profile as any).deepseek_api_key)
      } else if (provider === "gptsapi") {
        hasProfileKey = Boolean((profile as any).gptsapi_api_key)
      } else {
        const providerKey = `${provider}_api_key` as keyof typeof profile
        hasProfileKey = Boolean(profile?.[providerKey])
      }

      const isProviderEnabled = hasProfileKey || data.isUsingEnvKeyMap[provider]

      if (provider === "gptsapi") {
        // Keep GPTSAPI models visible in the selector even when dynamic fetch fails.
        const gptsapiModels = isProviderEnabled
          ? await fetchGptsapiModels()
          : []

        if (gptsapiModels.length > 0) {
          modelsToAdd.push(...gptsapiModels)
        } else {
          const fallbackModels = LLM_LIST_MAP[provider]
          if (Array.isArray(fallbackModels)) {
            modelsToAdd.push(...fallbackModels)
          }
        }

        continue
      }

      if (!isProviderEnabled) {
        continue
      }

      const models = LLM_LIST_MAP[provider]
      if (Array.isArray(models)) {
        modelsToAdd.push(...models)
      }
    }

    return {
      envKeyMap: data.isUsingEnvKeyMap,
      hostedModels: modelsToAdd
    }
  } catch (error) {
    console.warn("Error fetching hosted models: " + error)
  }
}

export const fetchGptsapiModels = async () => {
  try {
    const response = await fetch("/api/models/gptsapi")

    if (!response.ok) {
      throw new Error(`GPTSAPI server is not responding.`)
    }

    const payload = (await response.json()) as {
      models?: Array<{
        id?: string
      }>
    }

    const models = (payload.models || [])
      .map(model => (model.id || "").trim())
      .filter(modelId => modelId.length > 0)
      .filter(modelId => isLikelyChatModel(modelId))
      .map(
        (modelId): LLM => ({
          modelId: toGptsapiModelId(modelId),
          modelName: modelId,
          provider: "gptsapi",
          hostedId: modelId,
          platformLink: GPTSAPI_PLATFORM_LINK,
          imageInput: isLikelyImageModel(modelId)
        })
      )
      .sort((a, b) => a.modelName.localeCompare(b.modelName))

    const uniqueModelMap = new Map<string, LLM>()
    for (const model of models) {
      uniqueModelMap.set(model.modelId, model)
    }

    return Array.from(uniqueModelMap.values())
  } catch (error) {
    console.warn("Error fetching GPTSAPI models: " + error)
    return []
  }
}

export const fetchOpenRouterModels = async () => {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models")

    if (!response.ok) {
      throw new Error(`OpenRouter server is not responding.`)
    }

    const { data } = await response.json()

    const openRouterModels = data.map(
      (model: {
        id: string
        name: string
        context_length: number
      }): OpenRouterLLM => ({
        modelId: model.id as LLMID,
        modelName: model.id,
        provider: "openrouter",
        hostedId: model.name,
        platformLink: "https://openrouter.dev",
        imageInput: false,
        maxContext: model.context_length
      })
    )

    return openRouterModels
  } catch (error) {
    console.error("Error fetching Open Router models: " + error)
    toast.error("Error fetching Open Router models: " + error)
  }
}
