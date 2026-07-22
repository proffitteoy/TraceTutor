import type {
  IrisGateway,
  LearningRequest,
  LearningResponse
} from "@/lib/contracts"

const sleep = (duration: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, duration)

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer)
        reject(new DOMException("请求已取消", "AbortError"))
      },
      { once: true }
    )
  })

export class DemoGateway implements IrisGateway {
  async send(
    request: LearningRequest,
    signal?: AbortSignal
  ): Promise<LearningResponse> {
    await sleep(650, signal)

    if (request.input_mode === "review") {
      return {
        render_type: "learning_response",
        mode: "review_and_variant",
        summary: "先回看夹逼结构，再用不同入口完成一道迁移题。",
        cards: [
          {
            type: "old_question_review",
            title: "旧题回顾",
            question_id: "DEMO-Q-001",
            content:
              "上次的关键断点不是极限运算，而是没有从目标值反推可用的上下界。"
          },
          {
            type: "method_diagnosis",
            title: "方法诊断",
            content:
              "你已经能识别夹逼定理，但主动构造上下界仍不稳定。",
            tags: ["数列极限", "夹逼定理", "主动构造"]
          },
          {
            type: "new_question",
            title: "同知识点 · 换方法",
            question_id: "DEMO-Q-002",
            content: "求极限：limₙ→∞ n(√(n² + 1) − n)。",
            difficulty: 3
          },
          {
            type: "state_change",
            title: "状态写回",
            content: "本轮只生成待验证建议；完成作答后才可更新掌握度。",
            status: "pending"
          }
        ],
        actions: [
          { type: "submit_answer", label: "提交答案" },
          { type: "request_hint", label: "给我一个提示" }
        ],
        pending_state_write: true,
        meta: {
          source: "demo",
          request_id: `demo-${Date.now()}`
        }
      }
    }

    return {
      render_type: "learning_response",
      mode: request.input_mode,
      summary: "我会把题目拆成可检查的推理步骤，并标出最值得迁移的方法。",
      cards: [
        {
          type: "solution",
          title: "解题路径",
          content: `已收到：${request.user_text}`,
          steps: [
            "先明确已知条件、目标量与允许使用的结论。",
            "把核心变形写成可逐步检查的等价关系。",
            "最后核对定义域、边界条件与结论适用范围。"
          ],
          methods: ["结构化拆解", "条件核验"]
        },
        {
          type: "method_summary",
          title: "方法沉淀",
          content: "真实 Agent 接入后，这里只渲染网关返回的方法标签，不在前端推断。",
          tags: ["演示模式", "等待 Agent 接入"]
        },
        {
          type: "state_change",
          title: "学习状态",
          content: "当前没有真实作答证据，因此不会改写 SQLite 中的正式状态。",
          status: "pending"
        }
      ],
      actions: [
        { type: "request_hint", label: "追问关键一步" },
        { type: "generate_variant", label: "生成一道变式" }
      ],
      pending_state_write: false,
      meta: {
        source: "demo",
        request_id: `demo-${Date.now()}`
      }
    }
  }
}
