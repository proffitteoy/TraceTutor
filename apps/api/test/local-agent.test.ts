import { describe, expect, it } from "vitest"
import type {
  JsonGenerationRequest,
  LocalModel,
  ModelHealth
} from "../src/agent/local-model.js"
import { LocalAgentRuntime } from "../src/agent/local-agent.js"
import type { LearningRequest } from "../src/contracts.js"

class ScriptedModel implements LocalModel {
  readonly prompts: Array<{ name: string; prompt: string }> = []

  constructor(
    private readonly outputs: Record<string, unknown>
  ) {}

  async health(): Promise<ModelHealth> {
    return { ready: true, detail: "test model ready" }
  }

  async generateJson<T>(
    request: JsonGenerationRequest<T>
  ): Promise<T> {
    this.prompts.push({ name: request.name, prompt: request.prompt })
    return request.schema.parse(this.outputs[request.name])
  }
}

const request: LearningRequest = {
  session_id: "S1",
  user_id: "U1",
  input_mode: "new_question",
  user_text: "求 lim(x→0) sin(x)/x",
  attachments: [],
  active_question_id: null
}

describe("LocalAgentRuntime", () => {
  it("在本地完成计划和教学输出，不依赖外部 Agent 平台", async () => {
    const model = new ScriptedModel({
      query_plan: {
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
      teaching_output: {
        summary: "从单位圆或夹逼定理出发。",
        cards: [
          {
            type: "solution",
            title: "解题路径",
            content: "该极限等于 1。",
            steps: ["在 0 附近使用夹逼不等式。", "两侧同时趋于 1。"],
            methods: ["夹逼定理"]
          }
        ],
        actions: [{ type: "request_hint", label: "只看下一步" }]
      }
    })
    const runtime = new LocalAgentRuntime(model)

    const response = await runtime.run(request, { requestId: "REQ1" })

    expect(response.meta).toMatchObject({
      source: "local_agent",
      request_id: "REQ1"
    })
    expect(response.cards[0]?.type).toBe("solution")
    expect(model.prompts.map(item => item.name)).toEqual([
      "query_plan",
      "teaching_output"
    ])
  })

  it("数据库端口缺失时把真实降级原因交给本地模型", async () => {
    const model = new ScriptedModel({
      query_plan: {
        version: "1.0",
        intent: "SCHEDULED_REVIEW",
        task_types: ["SCHEDULED_REVIEW"],
        state_queries: [
          {
            tool: "state.query_user_snapshot",
            filters: {}
          }
        ],
        asset_queries: [],
        expected_output: {
          include_old_review: true,
          include_new_question: false,
          include_method_comparison: false,
          include_state_update: false
        }
      },
      teaching_output: {
        summary: "当前没有可读取的个性化历史。",
        cards: [
          {
            type: "method_summary",
            title: "降级说明",
            content: "数据库业务工具尚未接入，本轮只做普通复习建议。"
          }
        ],
        actions: []
      }
    })
    const runtime = new LocalAgentRuntime(model)

    await runtime.run(
      { ...request, input_mode: "review", user_text: "复习最近错题" },
      { requestId: "REQ2" }
    )

    expect(model.prompts[1]?.prompt).toContain(
      "数据库业务工具端口尚未接入"
    )
  })

  it("拒绝模型编造 question_id", async () => {
    const model = new ScriptedModel({
      query_plan: {
        version: "1.0",
        intent: "GENERATE_SIMILAR_QUESTION",
        task_types: ["GENERATE_SIMILAR_QUESTION"],
        state_queries: [],
        asset_queries: [],
        expected_output: {
          include_old_review: false,
          include_new_question: true,
          include_method_comparison: false,
          include_state_update: false
        }
      },
      teaching_output: {
        summary: "生成一道新题。",
        cards: [
          {
            type: "new_question",
            title: "变式题",
            question_id: "FAKE-Q",
            content: "一道不存在于工具结果中的题。"
          }
        ],
        actions: []
      }
    })
    const runtime = new LocalAgentRuntime(model)

    await expect(
      runtime.run(request, { requestId: "REQ3" })
    ).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID"
    })
  })

  it("拒绝模型在没有写入证据时声称状态 pending", async () => {
    const model = new ScriptedModel({
      query_plan: {
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
      teaching_output: {
        summary: "讲解完成。",
        cards: [
          {
            type: "state_change",
            title: "学习状态",
            content: "已进入待写回。",
            status: "pending"
          }
        ],
        actions: []
      }
    })
    const runtime = new LocalAgentRuntime(model)

    await expect(
      runtime.run(request, { requestId: "REQ4" })
    ).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID"
    })
  })
})
