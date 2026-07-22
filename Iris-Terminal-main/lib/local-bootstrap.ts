import { prisma } from "@/lib/prisma"
import {
  LOCAL_PROFILE_ID,
  LOCAL_USER_ID,
  LOCAL_USERNAME,
  LOCAL_WORKSPACE_ID
} from "@/lib/local-config"
import {
  LOCAL_PROFILE_CONFIG,
  LOCAL_WORKSPACE_CONFIG,
  PROJECT_NAME
} from "@/lib/project-config"
import {
  DEFAULT_CHAT_CONTEXT_LENGTH,
  DEFAULT_CHAT_TEMPERATURE
} from "@/lib/default-chat-settings"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"

export const ensureLocalBootstrap = async () => {
  const preferDeepseek =
    Boolean(process.env.DEEPSEEK_API_KEY) && !process.env.OPENAI_API_KEY

  const user = await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: {
      id: LOCAL_USER_ID
    }
  })

  const profile = await prisma.profile.upsert({
    where: { user_id: LOCAL_USER_ID },
    update: {
      username: LOCAL_PROFILE_CONFIG.username,
      display_name: LOCAL_PROFILE_CONFIG.displayName,
      bio: LOCAL_PROFILE_CONFIG.bio,
      profile_context: LOCAL_PROFILE_CONFIG.profileContext,
      openai_api_key: process.env.OPENAI_API_KEY || "",
      openai_organization_id:
        process.env.NEXT_PUBLIC_OPENAI_ORGANIZATION_ID || "",
      anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
      google_gemini_api_key: process.env.GOOGLE_GEMINI_API_KEY || "",
      mistral_api_key: process.env.MISTRAL_API_KEY || "",
      groq_api_key: process.env.GROQ_API_KEY || "",
      perplexity_api_key: process.env.PERPLEXITY_API_KEY || "",
      openrouter_api_key: process.env.OPENROUTER_API_KEY || "",
      azure_openai_api_key: process.env.AZURE_OPENAI_API_KEY || "",
      azure_openai_endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
      azure_openai_35_turbo_id: process.env.AZURE_GPT_35_TURBO_NAME || "",
      azure_openai_45_turbo_id: process.env.AZURE_GPT_45_TURBO_NAME || "",
      azure_openai_45_vision_id: process.env.AZURE_GPT_45_VISION_NAME || "",
      azure_openai_embeddings_id: process.env.AZURE_EMBEDDINGS_NAME || "",
      use_azure_openai: Boolean(process.env.AZURE_OPENAI_API_KEY)
    },
    create: {
      id: LOCAL_PROFILE_ID,
      user_id: LOCAL_USER_ID,
      username: LOCAL_PROFILE_CONFIG.username || LOCAL_USERNAME,
      display_name: LOCAL_PROFILE_CONFIG.displayName,
      bio: LOCAL_PROFILE_CONFIG.bio,
      profile_context: LOCAL_PROFILE_CONFIG.profileContext,
      image_url: "",
      image_path: "",
      has_onboarded: true,
      use_azure_openai: Boolean(process.env.AZURE_OPENAI_API_KEY),
      openai_api_key: process.env.OPENAI_API_KEY || "",
      openai_organization_id:
        process.env.NEXT_PUBLIC_OPENAI_ORGANIZATION_ID || "",
      anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
      google_gemini_api_key: process.env.GOOGLE_GEMINI_API_KEY || "",
      mistral_api_key: process.env.MISTRAL_API_KEY || "",
      groq_api_key: process.env.GROQ_API_KEY || "",
      perplexity_api_key: process.env.PERPLEXITY_API_KEY || "",
      openrouter_api_key: process.env.OPENROUTER_API_KEY || "",
      azure_openai_api_key: process.env.AZURE_OPENAI_API_KEY || "",
      azure_openai_endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
      azure_openai_35_turbo_id: process.env.AZURE_GPT_35_TURBO_NAME || "",
      azure_openai_45_turbo_id: process.env.AZURE_GPT_45_TURBO_NAME || "",
      azure_openai_45_vision_id: process.env.AZURE_GPT_45_VISION_NAME || "",
      azure_openai_embeddings_id: process.env.AZURE_EMBEDDINGS_NAME || ""
    }
  })

  const workspace = await prisma.workspace.upsert({
    where: { id: LOCAL_WORKSPACE_ID },
    update: {
      name: LOCAL_WORKSPACE_CONFIG.name || PROJECT_NAME,
      description: LOCAL_WORKSPACE_CONFIG.description,
      default_prompt: UNIFIED_SYSTEM_PROMPT,
      default_temperature: DEFAULT_CHAT_TEMPERATURE,
      default_context_length: DEFAULT_CHAT_CONTEXT_LENGTH
    },
    create: {
      id: LOCAL_WORKSPACE_ID,
      user_id: LOCAL_USER_ID,
      name: LOCAL_WORKSPACE_CONFIG.name || PROJECT_NAME,
      description: LOCAL_WORKSPACE_CONFIG.description,
      is_home: true,
      default_context_length: DEFAULT_CHAT_CONTEXT_LENGTH,
      default_model: preferDeepseek ? "deepseek-chat" : "gpt-4o",
      default_prompt: UNIFIED_SYSTEM_PROMPT,
      default_temperature: DEFAULT_CHAT_TEMPERATURE,
      embeddings_provider: "openai",
      include_profile_context: true,
      include_workspace_instructions: true,
      instructions: "",
      sharing: "private",
      image_path: ""
    }
  })

  if (preferDeepseek && workspace.default_model.startsWith("gpt-")) {
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { default_model: "deepseek-chat" }
    })
  }

  return { user, profile, workspace }
}
