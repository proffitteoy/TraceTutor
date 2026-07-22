import { LLM, LLMID } from "@/types"

const GPTSAPI_PLATFORM_LINK = "https://api.gptsapi.net"

const toGptsapiModelId = (modelId: string) => `gptsapi::${modelId}` as LLMID

// Fallback set used when dynamic model discovery fails.
export const GPTSAPI_LLM_LIST: LLM[] = [
  {
    modelId: toGptsapiModelId("gpt-4o"),
    modelName: "gpt-4o",
    provider: "gptsapi",
    hostedId: "gpt-4o",
    platformLink: GPTSAPI_PLATFORM_LINK,
    imageInput: true
  },
  {
    modelId: toGptsapiModelId("gpt-4.1"),
    modelName: "gpt-4.1",
    provider: "gptsapi",
    hostedId: "gpt-4.1",
    platformLink: GPTSAPI_PLATFORM_LINK,
    imageInput: true
  },
  {
    modelId: toGptsapiModelId("gpt-5"),
    modelName: "gpt-5",
    provider: "gptsapi",
    hostedId: "gpt-5",
    platformLink: GPTSAPI_PLATFORM_LINK,
    imageInput: true
  },
  {
    modelId: toGptsapiModelId("deepseek-r1"),
    modelName: "deepseek-r1",
    provider: "gptsapi",
    hostedId: "deepseek-r1",
    platformLink: GPTSAPI_PLATFORM_LINK,
    imageInput: false
  },
  {
    modelId: toGptsapiModelId("claude-sonnet-4-5-20250929"),
    modelName: "claude-sonnet-4-5-20250929",
    provider: "gptsapi",
    hostedId: "claude-sonnet-4-5-20250929",
    platformLink: GPTSAPI_PLATFORM_LINK,
    imageInput: true
  },
  {
    modelId: toGptsapiModelId("gemini-2.5-flash"),
    modelName: "gemini-2.5-flash",
    provider: "gptsapi",
    hostedId: "gemini-2.5-flash",
    platformLink: GPTSAPI_PLATFORM_LINK,
    imageInput: true
  }
]
