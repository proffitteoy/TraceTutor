import {
  learningResponseSchema,
  type IrisGateway,
  type LearningRequest,
  type LearningResponse
} from "@/lib/contracts"

export class HttpGateway implements IrisGateway {
  constructor(private readonly baseUrl: string) {}

  async send(
    request: LearningRequest,
    signal?: AbortSignal
  ): Promise<LearningResponse> {
    const response = await fetch(`${this.baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      throw new Error(
        payload?.error?.message ??
          `教学网关返回异常状态：${response.status}`
      )
    }

    const payload: unknown = await response.json()
    const parsed = learningResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error("教学网关响应不符合 LearningResponse 契约")
    }

    return parsed.data as LearningResponse
  }
}
