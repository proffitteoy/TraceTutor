import { LOCAL_USER_ID } from "@/lib/local-config"

export async function getServerProfile() {
  return {
    user_id: LOCAL_USER_ID,
    use_azure_openai: Boolean(process.env.AZURE_OPENAI_API_KEY),
    openai_api_key: process.env.OPENAI_API_KEY || "",
    openai_organization_id:
      process.env.NEXT_PUBLIC_OPENAI_ORGANIZATION_ID || "",
    anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
    google_gemini_api_key: process.env.GOOGLE_GEMINI_API_KEY || "",
    mistral_api_key: process.env.MISTRAL_API_KEY || "",
    groq_api_key: process.env.GROQ_API_KEY || "",
    perplexity_api_key: process.env.PERPLEXITY_API_KEY || "",
    deepseek_api_key: process.env.DEEPSEEK_API_KEY || "",
    deepseek_base_url: process.env.DEEPSEEK_BASE_URL || "",
    gptsapi_api_key: process.env.GPTSAPI_API_KEY || "",
    gptsapi_base_url: process.env.GPTSAPI_BASE_URL || "",
    gptsapi_claude_base_url: process.env.GPTSAPI_CLAUDE_BASE_URL || "",
    gptsapi_gemini_base_url: process.env.GPTSAPI_GEMINI_BASE_URL || "",
    openrouter_api_key: process.env.OPENROUTER_API_KEY || "",
    azure_openai_api_key: process.env.AZURE_OPENAI_API_KEY || "",
    azure_openai_endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    azure_openai_35_turbo_id: process.env.AZURE_GPT_35_TURBO_NAME || "",
    azure_openai_45_turbo_id: process.env.AZURE_GPT_45_TURBO_NAME || "",
    azure_openai_45_vision_id: process.env.AZURE_GPT_45_VISION_NAME || "",
    azure_openai_embeddings_id: process.env.AZURE_EMBEDDINGS_NAME || ""
  }
}

export function checkApiKey(apiKey: string | null, keyName: string) {
  if (apiKey === null || apiKey === "") {
    throw new Error(`${keyName} API 密钥未配置`)
  }
}
