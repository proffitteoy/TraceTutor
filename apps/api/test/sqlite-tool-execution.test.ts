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
})
