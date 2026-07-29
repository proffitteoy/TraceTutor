import OpenAI from "openai"
import { z, type ZodType } from "zod"
import { AppError } from "../errors.js"

export interface ModelHealth {
  ready: boolean
  detail: string
}

export interface JsonGenerationRequest<T> {
  name: string
  system: string
  prompt: string
  schema: ZodType<T>
  temperature?: number
}

export interface LocalModel {
  health(): Promise<ModelHealth>
  generateJson<T>(request: JsonGenerationRequest<T>): Promise<T>
}

function normalizeJsonContent(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith("```")) return trimmed

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
}

/**
 * Agent Runtime 在本地运行；模型通过 OpenAI-compatible API 注入。
 * API 可以是本机推理服务，也可以是用户控制的模型网关。
 */
export class OpenAICompatibleModel implements LocalModel {
  private readonly client: OpenAI

  constructor(
    baseUrl: string,
    private readonly model: string,
    apiKey: string | undefined,
    timeoutMs: number,
    private readonly responseFormat: "json_schema" | "json_object"
  ) {
    this.client = new OpenAI({
      baseURL: baseUrl,
      apiKey: apiKey ?? "local-model-api",
      timeout: timeoutMs,
      maxRetries: 1
    })
  }

  async health(): Promise<ModelHealth> {
    try {
      const models = await this.client.models.list({
        timeout: 3_000,
        maxRetries: 0
      })
      const available = models.data.some(item => item.id === this.model)
      return available
        ? { ready: true, detail: `模型 API 与 ${this.model} 已就绪` }
        : {
            ready: false,
            detail: `模型 API 可连接，但未发现 ${this.model}`
          }
    } catch (error) {
      return {
        ready: false,
        detail:
          error instanceof Error
            ? `模型 API 不可用：${error.message}`
            : "模型 API 不可用"
      }
    }
  }

  async generateJson<T>(request: JsonGenerationRequest<T>): Promise<T> {
    let completion: OpenAI.Chat.Completions.ChatCompletion
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt }
        ],
        response_format:
          this.responseFormat === "json_schema"
            ? {
                type: "json_schema",
                json_schema: {
                  name: request.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
                  strict: true,
                  schema: z.toJSONSchema(request.schema)
                }
              }
            : { type: "json_object" },
        temperature: request.temperature ?? 0.2
      })
    } catch (error) {
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "模型 API 调用失败",
        503,
        error instanceof Error ? error.message : undefined
      )
    }

    const content = completion.choices[0]?.message.content
    if (!content) {
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        `模型 API 没有返回结构化内容：${request.name}`,
        502
      )
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(normalizeJsonContent(content))
    } catch {
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        `模型 API 没有返回合法 JSON：${request.name}`,
        502
      )
    }

    const parsed = request.schema.safeParse(decoded)
    if (!parsed.success) {
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        `模型 API 输出不符合 Schema：${request.name}`,
        502,
        parsed.error.flatten()
      )
    }

    return parsed.data
  }
}
