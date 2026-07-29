import Fastify, { type FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { OpenAICompatibleModel } from "../src/agent/local-model.js"
import { LocalAgentRuntime } from "../src/agent/local-agent.js"
import { createApp } from "../src/app.js"
import type { AppConfig } from "../src/config.js"
import { queryPlanSchema } from "../src/contracts.js"

let server: FastifyInstance | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe("OpenAICompatibleModel", () => {
  it("通过 Chat Completions JSON Schema 接口生成并复验结构化结果", async () => {
    let receivedFormat: unknown
    server = Fastify({ logger: false })
    server.get("/v1/models", async () => ({
      object: "list",
      data: [
        {
          id: "test-model",
          object: "model",
          created: 0,
          owned_by: "test"
        }
      ]
    }))
    server.post("/v1/chat/completions", async request => {
      receivedFormat = (
        request.body as { response_format?: unknown }
      ).response_format
      return {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                version: "1.0",
                intent: "NEW_QUESTION_SOLVE",
                task_types: ["NEW_QUESTION_SOLVE"],
                state_queries: [],
                asset_queries: [],
                expected_output: {
                  include_old_review: false,
                  include_new_question: false,
                  include_method_comparison: false,
                  include_state_update: false
                }
              })
            }
          }
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2
        }
      }
    })

    const baseUrl = await server.listen({
      host: "127.0.0.1",
      port: 0
    })
    const model = new OpenAICompatibleModel(
      `${baseUrl}/v1`,
      "test-model",
      undefined,
      2_000,
      "json_schema"
    )

    await expect(model.health()).resolves.toMatchObject({ ready: true })
    await expect(
      model.generateJson({
        name: "query_plan",
        system: "return json",
        prompt: "plan",
        schema: queryPlanSchema
      })
    ).resolves.toMatchObject({
      version: "1.0",
      intent: "NEW_QUESTION_SOLVE"
    })
    expect(receivedFormat).toMatchObject({ type: "json_schema" })
  })

  it("通过 /agent/chat 完成本地 Runtime 到模型 API 的真实 HTTP 链路", async () => {
    let completionIndex = 0
    server = Fastify({ logger: false })
    server.get("/v1/models", async () => ({
      object: "list",
      data: [
        {
          id: "test-model",
          object: "model",
          created: 0,
          owned_by: "test"
        }
      ]
    }))
    server.post("/v1/chat/completions", async () => {
      const contents = [
        {
          version: "1.0",
          intent: "NEW_QUESTION_SOLVE",
          task_types: ["NEW_QUESTION_SOLVE"],
          state_queries: [],
          asset_queries: [],
          expected_output: {
            include_old_review: false,
            include_new_question: false,
            include_method_comparison: false,
            include_state_update: false
          }
        },
        {
          summary: "使用夹逼定理。",
          cards: [
            {
              type: "solution",
              title: "解题路径",
              content: "极限为 1。",
              steps: ["建立夹逼不等式。", "取极限。"],
              methods: ["夹逼定理"]
            }
          ],
          actions: [{ type: "request_hint", label: "下一步提示" }]
        }
      ]
      const content = contents[completionIndex++]
      return {
        id: `chatcmpl-${completionIndex}`,
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(content)
            }
          }
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2
        }
      }
    })

    const modelBaseUrl = await server.listen({
      host: "127.0.0.1",
      port: 0
    })
    const model = new OpenAICompatibleModel(
      `${modelBaseUrl}/v1`,
      "test-model",
      undefined,
      2_000,
      "json_schema"
    )
    const config: AppConfig = {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 4100,
      logLevel: "silent",
      corsOrigins: ["http://localhost:3000"],
      modelApiBaseUrl: `${modelBaseUrl}/v1`,
      modelName: "test-model",
      modelResponseFormat: "json_schema",
      modelTimeoutMs: 2_000
    }
    const api = await createApp({
      config,
      agentRuntime: new LocalAgentRuntime(model)
    })

    try {
      const response = await api.inject({
        method: "POST",
        url: "/agent/chat",
        payload: {
          session_id: "S1",
          user_id: "U1",
          input_mode: "new_question",
          user_text: "求 lim(x→0) sin(x)/x",
          attachments: [],
          active_question_id: null
        }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        render_type: "learning_response",
        summary: "使用夹逼定理。",
        meta: { source: "local_agent" }
      })
      expect(completionIndex).toBe(2)
    } finally {
      await api.close()
    }
  })
})
