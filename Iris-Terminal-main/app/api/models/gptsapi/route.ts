import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ServerRuntime } from "next"

export const runtime: ServerRuntime = "edge"

const DEFAULT_GPTSAPI_BASE_URL = "https://api.gptsapi.net/v1"

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`
}

export async function GET() {
  try {
    const profile = await getServerProfile()
    const apiKey = (profile as any).gptsapi_api_key
    const baseUrls = Array.from(
      new Set(
        [
          (profile as any).gptsapi_base_url || DEFAULT_GPTSAPI_BASE_URL,
          (profile as any).gptsapi_claude_base_url || "",
          (profile as any).gptsapi_gemini_base_url || ""
        ]
          .map(url => url.trim())
          .filter(Boolean)
          .map(normalizeBaseUrl)
      )
    )

    checkApiKey(apiKey, "GPTSAPI")

    const uniqueModels = new Map<string, { id: string }>()
    let lastErrorStatus = 500
    let hasAnySuccess = false

    for (const baseUrl of baseUrls) {
      const response = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })

      if (!response.ok) {
        lastErrorStatus = response.status
        continue
      }

      hasAnySuccess = true

      const data = (await response.json()) as {
        data?: Array<{
          id?: string
        }>
      }

      for (const model of data.data || []) {
        if (!model?.id) continue
        uniqueModels.set(model.id, { id: model.id })
      }
    }

    if (!hasAnySuccess) {
      return new Response(
        JSON.stringify({
          message: "Failed to fetch GPTSAPI models."
        }),
        { status: lastErrorStatus }
      )
    }

    return new Response(
      JSON.stringify({
        models: Array.from(uniqueModels.values())
      }),
      { status: 200 }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        message: error?.message || "Failed to fetch GPTSAPI models."
      }),
      { status: error?.status || 500 }
    )
  }
}
