import {
  learningResponseSchema,
  practiceQuestionListSchema,
  questionDepositResultSchema,
  questionAttemptHistorySchema,
  type IrisGateway,
  type LearningRequest,
  type LearningResponse,
  type PracticeQuestion,
  type QuestionDepositRequest,
  type QuestionDepositResult,
  type QuestionAttemptHistoryItem,
  type ServiceReadiness
} from "@/lib/contracts"

export class HttpGateway implements IrisGateway {
  constructor(private readonly baseUrl: string) {}

  async checkReadiness(signal?: AbortSignal): Promise<ServiceReadiness> {
    try {
      const response = await fetch(`${this.baseUrl}/health/ready`, { signal })
      const payload = (await response.json()) as {
        status?: unknown
        dependencies?: unknown
      }
      const dependencies =
        typeof payload.dependencies === "object" && payload.dependencies !== null
          ? Object.fromEntries(Object.entries(payload.dependencies).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            ))
          : {}
      return { ready: response.ok && (payload.status === "ready" || payload.status === "degraded"), dependencies }
    } catch {
      return { ready: false, dependencies: {} }
    }
  }

  async listPracticeQuestions(
    input: { limit?: number; subjectCode?: string } = {},
    signal?: AbortSignal
  ): Promise<PracticeQuestion[]> {
    const query = new URLSearchParams()
    if (input.limit) query.set("limit", String(input.limit))
    if (input.subjectCode) query.set("subject_code", input.subjectCode)
    const suffix = query.size ? `?${query.toString()}` : ""
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/questions/practice${suffix}`, {
        signal
      })
    } catch {
      throw new Error("无法连接本地 TraceTutor API")
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      throw new Error(
        payload?.error?.message ?? `题库目录暂时不可用（${response.status}）`
      )
    }

    const payload: unknown = await response.json()
    const parsed = practiceQuestionListSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error("题库目录响应不符合约定")
    }

    return parsed.data.questions
  }

  async listQuestionAttempts(
    input: { userId: string; questionId: string; limit?: number },
    signal?: AbortSignal
  ): Promise<QuestionAttemptHistoryItem[]> {
    const query = new URLSearchParams({
      user_id: input.userId,
      limit: String(input.limit ?? 20)
    })
    let response: Response
    try {
      response = await fetch(
        `${this.baseUrl}/questions/${encodeURIComponent(input.questionId)}/attempts?${query.toString()}`,
        { signal }
      )
    } catch {
      throw new Error("无法连接 SQLite 作答历史服务")
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      throw new Error(
        payload?.error?.message ?? `本题历史暂时不可用（${response.status}）`
      )
    }
    const parsed = questionAttemptHistorySchema.safeParse(await response.json())
    if (!parsed.success) throw new Error("本题历史响应不符合约定")
    return parsed.data.attempts
  }

  async send(
    request: LearningRequest,
    signal?: AbortSignal
  ): Promise<LearningResponse> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal
      })
    } catch {
      throw new Error("Iris 教学服务未启动")
    }

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

  async depositQuestion(
    request: QuestionDepositRequest,
    signal?: AbortSignal
  ): Promise<QuestionDepositResult> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/questions/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal
      })
    } catch {
      throw new Error("无法连接题目入库服务")
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      throw new Error(
        payload?.error?.message ?? `题目入库失败（${response.status}）`
      )
    }

    const parsed = questionDepositResultSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error("题目入库响应不符合契约")
    return parsed.data
  }
}
