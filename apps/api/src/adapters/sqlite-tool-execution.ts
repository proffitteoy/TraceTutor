import {
  toolResultSchema,
  type ToolName,
  type ToolResult
} from "../contracts.js"
import type {
  RequestContext,
  ToolExecutionHealth,
  ToolExecutionPort
} from "../ports.js"

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

export class HttpSQLiteToolExecutionPort implements ToolExecutionPort {
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
