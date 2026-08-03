import {
  toolResultSchema,
  type ToolName,
  type ToolResult
} from "../contracts.js"
import type {
  QuestionAttemptHistoryItem,
  QuestionHistoryPort,
  RequestContext,
  ToolExecutionHealth,
  ToolExecutionPort
} from "../ports.js"
import { z } from "zod"

const sqliteCapabilities = new Set<ToolName>([
  "state.query_user_snapshot",
  "state.query_wrong_questions",
  "state.query_review_due_items",
  "state.write_attempt_result",
  "state.write_review_result",
  "state.apply_state_delta",
  "log.write_agent_event"
])

interface ErrorEnvelope {
  detail?: unknown
  error?: {
    code?: unknown
    message?: unknown
  }
}

function errorMessage(status: number, payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return `SQLite 状态服务返回 HTTP ${status}`
  }
  const envelope = payload as ErrorEnvelope
  if (typeof envelope.detail === "string") return envelope.detail
  if (typeof envelope.error?.message === "string") {
    return envelope.error.message
  }
  return `SQLite 状态服务返回 HTTP ${status}`
}

const attemptHistorySchema = z.array(
  z.object({
    id: z.string().min(1),
    session_id: z.string().nullable(),
    user_answer_text: z.string().nullable(),
    is_correct: z.union([z.literal(0), z.literal(1), z.boolean()]).nullable(),
    score: z.number().nullable(),
    attempt_status: z.enum([
      "viewed",
      "submitted",
      "checked",
      "abandoned",
      "skipped"
    ]),
    error_detail_text: z.string().nullable(),
    created_at: z.string().min(1),
    checked_at: z.string().nullable()
  })
)

export class HttpSQLiteToolExecutionPort
implements ToolExecutionPort, QuestionHistoryPort {
  readonly capabilities = sqliteCapabilities

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly timeoutMs = 5_000
  ) {}

  private headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
    }
  }

  async health(): Promise<ToolExecutionHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health/ready`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs)
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        return {
          ready: false,
          detail: errorMessage(response.status, payload)
        }
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("status" in payload) ||
        payload.status !== "ready"
      ) {
        return {
          ready: false,
          detail: "SQLite 状态服务就绪响应不符合契约"
        }
      }
      return { ready: true, detail: "SQLite 状态服务已就绪" }
    } catch (error) {
      return {
        ready: false,
        detail:
          error instanceof Error
            ? error.message
            : "SQLite 状态服务健康检查失败"
      }
    }
  }

  async listQuestionAttempts(input: {
    userId: string
    questionId: string
    limit: number
  }): Promise<QuestionAttemptHistoryItem[]> {
    const query = new URLSearchParams({
      question_id: input.questionId,
      limit: String(input.limit)
    })
    const response = await fetch(
      `${this.baseUrl}/api/v1/state/users/${encodeURIComponent(input.userId)}/attempts?${query.toString()}`,
      {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs)
      }
    )
    const payload: unknown = await response.json()
    if (!response.ok) {
      throw new Error(errorMessage(response.status, payload))
    }
    const attempts = attemptHistorySchema.parse(payload)
    return attempts.map(attempt => ({
      attemptId: attempt.id,
      sessionId: attempt.session_id,
      userAnswerText: attempt.user_answer_text,
      isCorrect:
        attempt.is_correct === null ? null : Boolean(attempt.is_correct),
      score: attempt.score,
      attemptStatus: attempt.attempt_status,
      errorDetailText: attempt.error_detail_text,
      createdAt: attempt.created_at,
      checkedAt: attempt.checked_at
    }))
  }

  async execute(
    tool: ToolName,
    input: Readonly<Record<string, unknown>>,
    context: RequestContext
  ): Promise<ToolResult> {
    if (!this.capabilities.has(tool)) {
      throw new Error(`SQLite 状态服务不支持工具：${tool}`)
    }
    const response = await fetch(`${this.baseUrl}/internal/tool-execution`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        tool,
        input,
        context: {
          request_id: context.requestId,
          user_id: context.userId,
          session_id: context.sessionId
        }
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    })
    const payload: unknown = await response.json()
    if (!response.ok) {
      throw new Error(errorMessage(response.status, payload))
    }
    return toolResultSchema.parse(payload)
  }
}
