import { afterEach, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { LocalAgentRuntime } from "../src/agent/local-agent.js"
import type { LocalModel } from "../src/agent/local-model.js"
import { createApp } from "../src/app.js"
import type { AppConfig } from "../src/config.js"
import type {
  PracticeQuestionCatalogPort,
  QuestionHistoryPort,
  ToolExecutionPort
} from "../src/ports.js"

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4100,
  logLevel: "silent",
  corsOrigins: ["http://localhost:3000"],
  modelApiBaseUrl: "http://127.0.0.1:11434/v1",
  modelName: "test-model",
  modelResponseFormat: "json_schema",
  modelTimeoutMs: 1_000,
  sqliteTimeoutMs: 1_000
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
      status: "unavailable",
      dependencies: {
        local_agent_runtime: "unconfigured",
        tool_execution: "unconfigured"
      }
    })
  })

  it("SQLite 已就绪但 PgSQL 工具缺失时仍标记为部分可用", async () => {
    const model: LocalModel = {
      async health() {
        return { ready: true, detail: "test model ready" }
      },
      async generateJson() {
        throw new Error("not used")
      }
    }
    const sqliteOnlyPort: ToolExecutionPort = {
      capabilities: new Set(["state.query_user_snapshot"]),
      async health() {
        return { ready: true, detail: "SQLite state service ready" }
      },
      async execute() {
        throw new Error("not used")
      }
    }
    app = await createApp({
      config,
      agentRuntime: new LocalAgentRuntime(model, sqliteOnlyPort),
      toolExecution: sqliteOnlyPort
    })

    const ready = await app.inject({ method: "GET", url: "/health/ready" })

    expect(ready.statusCode).toBe(503)
    expect(ready.json()).toMatchObject({
      status: "unavailable",
      dependencies: {
        local_agent_runtime: "ready",
        model_api: "ready",
        sqlite_state: "ready",
        tool_execution: expect.stringContaining("asset.get_question_detail")
      }
    })
  })
})

describe("boundary routes", () => {
  it("返回经过批准且可公开练习的题目目录", async () => {
    const questionCatalog: PracticeQuestionCatalogPort = {
      async listPracticeQuestions(input) {
        expect(input).toEqual({ limit: 12, subjectCode: "advanced_algebra" })
        return [
          {
            questionId: "question-1",
            title: "矩阵像空间维数",
            stem: "设线性变换由左乘矩阵定义，求其像空间维数。",
            questionType: "proof",
            difficulty: 2,
            subjectCode: "advanced_algebra",
            subjectName: "高等代数"
          }
        ]
      }
    }
    app = await createApp({ config, questionCatalog })

    const response = await app.inject({
      method: "GET",
      url: "/questions/practice?limit=12&subject_code=advanced_algebra"
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      questions: [
        expect.objectContaining({
          questionId: "question-1",
          subjectName: "高等代数"
        })
      ]
    })
  })

  it("题库目录未装配时不返回假题", async () => {
    app = await createApp({ config })

    const response = await app.inject({
      method: "GET",
      url: "/questions/practice"
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      error: { code: "DEPENDENCY_UNAVAILABLE" }
    })
  })

  it("按用户与题目返回 SQLite 作答历史", async () => {
    const questionHistory: QuestionHistoryPort = {
      async listQuestionAttempts(input) {
        expect(input).toEqual({
          userId: "user-1",
          questionId: "question-1",
          limit: 8
        })
        return [{
          attemptId: "attempt-1",
          sessionId: "session-1",
          userAnswerText: "答案是 2",
          isCorrect: true,
          score: 1,
          attemptStatus: "checked",
          errorDetailText: null,
          createdAt: "2026-08-03 10:00:00",
          checkedAt: "2026-08-03 10:00:01"
        }]
      }
    }
    app = await createApp({ config, questionHistory })

    const response = await app.inject({
      method: "GET",
      url: "/questions/question-1/attempts?user_id=user-1&limit=8"
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      attempts: [expect.objectContaining({
        attemptId: "attempt-1",
        userAnswerText: "答案是 2",
        isCorrect: true
      })]
    })
  })

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
