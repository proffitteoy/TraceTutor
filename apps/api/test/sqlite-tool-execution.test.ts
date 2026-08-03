import { afterEach, describe, expect, it, vi } from "vitest"
import { HttpSQLiteToolExecutionPort } from "../src/adapters/sqlite-tool-execution.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("HttpSQLiteToolExecutionPort", () => {
  it("使用可信 RequestContext 调用内部 SQLite 工具执行入口", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body).toMatchObject({
          tool: "state.query_user_snapshot",
          input: {
            user_id: "U1",
            session_id: "S1"
          },
          context: {
            request_id: "REQ1",
            user_id: "U1",
            session_id: "S1"
          }
        })
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer sqlite-service-token"
        })
        return new Response(
          JSON.stringify({
            result: { user_snapshot: { user_id: "U1" } },
            meta: {
              source: "sqlite",
              status: "ok",
              reason: "snapshot loaded",
              request_id: "REQ1"
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
    )
    vi.stubGlobal("fetch", fetchMock)
    const port = new HttpSQLiteToolExecutionPort(
      "http://127.0.0.1:8000",
      "sqlite-service-token",
      1_000
    )

    const result = await port.execute(
      "state.query_user_snapshot",
      { user_id: "U1", session_id: "S1" },
      { requestId: "REQ1", userId: "U1", sessionId: "S1" }
    )

    expect(result.meta.source).toBe("sqlite")
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("健康检查拒绝非 ready 响应", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "degraded" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          })
      )
    )
    const port = new HttpSQLiteToolExecutionPort("http://127.0.0.1:8000")

    await expect(port.health()).resolves.toMatchObject({ ready: false })
  })

  it("按题读取并收窄 SQLite 作答历史", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toContain(
          "/api/v1/state/users/U1/attempts?question_id=Q1&limit=10"
        )
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer sqlite-service-token"
        })
        return new Response(JSON.stringify([{
          id: "A1",
          user_id: "U1",
          session_id: "S1",
          question_id: "Q1",
          user_answer_text: "x=2",
          is_correct: 1,
          score: 1,
          attempt_status: "checked",
          error_detail_text: null,
          created_at: "2026-08-03 10:00:00",
          checked_at: "2026-08-03 10:00:01",
          metadata_json: {},
          tags: []
        }]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      }
    )
    vi.stubGlobal("fetch", fetchMock)
    const port = new HttpSQLiteToolExecutionPort(
      "http://127.0.0.1:8000",
      "sqlite-service-token"
    )

    await expect(port.listQuestionAttempts({
      userId: "U1",
      questionId: "Q1",
      limit: 10
    })).resolves.toEqual([{
      attemptId: "A1",
      sessionId: "S1",
      userAnswerText: "x=2",
      isCorrect: true,
      score: 1,
      attemptStatus: "checked",
      errorDetailText: null,
      createdAt: "2026-08-03 10:00:00",
      checkedAt: "2026-08-03 10:00:01"
    }])
  })
})
