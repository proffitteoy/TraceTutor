import { LLM } from "@/types"

const DEEPSEEK_PLATFORM_LINK = "https://platform.deepseek.com"

const DeepSeekChat: LLM = {
  modelId: "deepseek-chat",
  modelName: "DeepSeek Chat",
  provider: "deepseek",
  hostedId: "deepseek-chat",
  platformLink: DEEPSEEK_PLATFORM_LINK,
  imageInput: false
}

const DeepSeekReasoner: LLM = {
  modelId: "deepseek-reasoner",
  modelName: "DeepSeek Reasoner",
  provider: "deepseek",
  hostedId: "deepseek-reasoner",
  platformLink: DEEPSEEK_PLATFORM_LINK,
  imageInput: false
}

export const DEEPSEEK_LLM_LIST: LLM[] = [DeepSeekChat, DeepSeekReasoner]
