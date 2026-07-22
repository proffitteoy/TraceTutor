import type {
  IrisGateway,
  LearningRequest,
  LearningResponse
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
      throw new Error(`教学网关返回异常状态：${response.status}`)
    }

    return (await response.json()) as LearningResponse
  }
}
