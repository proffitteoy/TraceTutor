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

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() }))
})

const chatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable()
      })
    })
  )
})

class ModelApiResponseError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = "ModelApiResponseError"
  }
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
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(
    baseUrl: string,
    private readonly model: string,
    apiKey: string | undefined,
    private readonly timeoutMs: number,
    private readonly responseFormat: "json_schema" | "json_object"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.apiKey = apiKey ?? "local-model-api"
  }

  private async requestJson(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    retries: number
  ): Promise<unknown> {
    let lastError: unknown

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
            ...init.headers
          },
          signal: AbortSignal.timeout(timeoutMs)
        })
        const body = await response.text()

        if (!response.ok) {
          throw new ModelApiResponseError(
            `模型 API 返回 HTTP ${response.status}${
              body ? `：${body.slice(0, 500)}` : ""
            }`,
            (response.status === 408 ||
              response.status === 409 ||
              response.status === 429 ||
              response.status >= 500)
          )
        }

        try {
          return JSON.parse(body) as unknown
        } catch {
          throw new ModelApiResponseError(
            "模型 API 返回的响应不是合法 JSON",
            false
          )
        }
      } catch (error) {
        lastError = error
        if (
          attempt >= retries ||
          (error instanceof ModelApiResponseError && !error.retryable)
        ) {
          throw error
        }
      }
    }

    throw lastError
  }

  async health(): Promise<ModelHealth> {
    try {
      const models = modelsResponseSchema.parse(
        await this.requestJson("/models", { method: "GET" }, 3_000, 0)
      )
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
    let completion: z.infer<typeof chatCompletionSchema>
    const jsonSchema = z.toJSONSchema(request.schema)
    const schemaInstruction =
      this.responseFormat === "json_object"
        ? `Return exactly one JSON object that satisfies this JSON Schema. Do not add keys outside the schema and do not wrap the object in Markdown:\n${JSON.stringify(jsonSchema)}`
        : undefined
    try {
      completion = chatCompletionSchema.parse(
        await this.requestJson(
          "/chat/completions",
          {
            method: "POST",
            body: JSON.stringify({
              model: this.model,
              messages: [
                {
                  role: "system",
                  content: schemaInstruction
                    ? `${request.system}\n\n${schemaInstruction}`
                    : request.system
                },
                { role: "user", content: request.prompt }
              ],
              response_format:
                this.responseFormat === "json_schema"
                  ? {
                      type: "json_schema",
                      json_schema: {
                      name: request.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
                      strict: true,
                      schema: jsonSchema
                      }
                    }
                  : { type: "json_object" },
              temperature: request.temperature ?? 0.2
            })
          },
          this.timeoutMs,
          1
        )
      )
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
      if (this.responseFormat === "json_object") {
        let repairCompletion: z.infer<typeof chatCompletionSchema>
        try {
          repairCompletion = chatCompletionSchema.parse(
            await this.requestJson(
              "/chat/completions",
              {
                method: "POST",
                body: JSON.stringify({
                  model: this.model,
                  messages: [
                    {
                      role: "system",
                      content: `${request.system}\n\n${schemaInstruction}`
                    },
                    { role: "user", content: request.prompt },
                    { role: "assistant", content },
                    {
                      role: "user",
                      content: `The previous JSON failed validation. Correct every listed issue and return only the complete corrected JSON object. Validation issues:\n${JSON.stringify(parsed.error.issues)}`
                    }
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0
                })
              },
              this.timeoutMs,
              1
            )
          )
        } catch (error) {
          throw new AppError(
            "MODEL_UNAVAILABLE",
            "模型 API 结构修复调用失败",
            503,
            error instanceof Error ? error.message : undefined
          )
        }

        const repairedContent = repairCompletion.choices[0]?.message.content
        if (repairedContent) {
          try {
            const repaired = request.schema.safeParse(
              JSON.parse(normalizeJsonContent(repairedContent))
            )
            if (repaired.success) return repaired.data
          } catch {
            // The original validation error remains the stable public error.
          }
        }
      }
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
