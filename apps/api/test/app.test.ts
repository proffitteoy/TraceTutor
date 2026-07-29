import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { createApp } from "../src/app.js"
import type { AppConfig } from "../src/config.js"

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4100,
  logLevel: "silent",
  corsOrigins: ["http://localhost:3000"],
  modelApiBaseUrl: "http://127.0.0.1:11434/v1",
  modelName: "test-model",
  modelResponseFormat: "json_schema",
  modelTimeoutMs: 1_000
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe("health routes", () => {
  it("进程存活，但依赖未接入时 readiness 明确降级", async () => {
    app = await createApp({ config })

    const live = await app.inject({ method: "GET", url: "/health/live" })
    const ready = await app.inject({ method: "GET", url: "/health/ready" })

    expect(live.statusCode).toBe(200)
    expect(live.json()).toMatchObject({ status: "ok" })
    expect(ready.statusCode).toBe(503)
    expect(ready.json()).toMatchObject({
      status: "degraded",
      dependencies: {
        local_agent_runtime: "unconfigured",
        tool_execution: "unconfigured"
      }
    })
  })
})

describe("boundary routes", () => {
  it("本地 Agent Runtime 未装配时不伪造教学结果", async () => {
    app = await createApp({ config })

    const response = await app.inject({
      method: "POST",
      url: "/agent/chat",
      payload: {
        session_id: "S1",
        user_id: "U1",
        input_mode: "new_question",
        user_text: "求一个极限",
        attachments: [],
        active_question_id: null
      }
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      error: { code: "DEPENDENCY_UNAVAILABLE" }
    })
  })

  it("数据库工具未接入时返回具体工具名", async () => {
    app = await createApp({ config })

    const response = await app.inject({
      method: "POST",
      url: "/tools/state/query-user-snapshot",
      payload: {
        user_id: "U1",
        session_id: "S1"
      }
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        details: { tool: "state.query_user_snapshot" }
      }
    })
  })

  it("查询计划校验拒绝未开放工具", async () => {
    app = await createApp({ config })

    const response = await app.inject({
      method: "POST",
      url: "/internal/query-plans/validate",
      payload: {
        version: "1.0",
        intent: "NEW_QUESTION_SOLVE",
        task_types: ["NEW_QUESTION_SOLVE"],
        state_queries: [
          {
            tool: "execute_sql",
            filters: {}
          }
        ],
        asset_queries: [],
        expected_output: {}
      }
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" }
    })
  })
})
