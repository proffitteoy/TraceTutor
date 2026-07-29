import { describe, expect, it } from "vitest"
import {
  queryPlanSchema,
  stateDeltaSchema,
  toolNames
} from "../src/contracts.js"
import { toolInputSchemas, toolRoutes } from "../src/tool-schemas.js"

describe("queryPlanSchema", () => {
  it("接受有限工具组成的复习计划", () => {
    const result = queryPlanSchema.safeParse({
      version: "1.0",
      intent: "REVIEW_AND_VARIANT",
      task_types: [
        "REVIEW_OLD_QUESTION",
        "GENERATE_SIMILAR_QUESTION",
        "METHOD_TRANSFER"
      ],
      state_queries: [
        {
          tool: "state.query_wrong_questions",
          filters: {
            knowledge_area: "极限",
            state_labels: ["weak", "reviewing"]
          },
          limit: 5
        }
      ],
      asset_queries: [
        {
          tool: "asset.search_same_knowledge_different_method",
          base_question_id: "Q123",
          difficulty_policy: "near",
          limit: 3
        }
      ],
      expected_output: {
        include_old_review: true,
        include_new_question: true,
        include_method_comparison: true,
        include_state_update: true
      }
    })

    expect(result.success).toBe(true)
  })

  it("拒绝 SQL 字段和越界 limit", () => {
    const result = queryPlanSchema.safeParse({
      version: "1.0",
      intent: "NEW_QUESTION_SOLVE",
      task_types: ["NEW_QUESTION_SOLVE"],
      state_queries: [
        {
          tool: "state.query_user_snapshot",
          filters: { sql: "select * from users" },
          limit: 100
        }
      ],
      asset_queries: [],
      expected_output: {}
    })

    expect(result.success).toBe(false)
  })
})

describe("stateDeltaSchema", () => {
  it("接受有真实作答证据的知识点建议", () => {
    const result = stateDeltaSchema.safeParse({
      target_type: "knowledge_mastery",
      target_id: "KP-LIMIT",
      proposed_change: 0.1,
      reason: "用户独立完成题目",
      evidence: {
        question_id: "Q123",
        attempt_id: "A123",
        judgement: "correct",
        knowledge_point_ids: ["KP-LIMIT"],
        method_ids: ["M-SQUEEZE"]
      }
    })

    expect(result.success).toBe(true)
  })

  it("拒绝没有 attempt 或 review 证据的建议", () => {
    const result = stateDeltaSchema.safeParse({
      target_type: "method_mastery",
      target_id: "M-SQUEEZE",
      proposed_status: "stable",
      reason: "模型认为用户已经掌握",
      evidence: {
        question_id: "Q123",
        judgement: "ungraded",
        knowledge_point_ids: ["KP-LIMIT"],
        method_ids: ["M-SQUEEZE"]
      }
    })

    expect(result.success).toBe(false)
  })
})

describe("tool registry", () => {
  it("每个白名单工具都有输入 schema 和静态 HTTP 路由", () => {
    const schemaNames = Object.keys(toolInputSchemas).sort()
    const routeNames = toolRoutes.map(route => route.name).sort()
    const contractNames = [...toolNames].sort()

    expect(schemaNames).toEqual(contractNames)
    expect(routeNames).toEqual(contractNames)
    expect(new Set(toolRoutes.map(route => route.path)).size).toBe(
      toolRoutes.length
    )
  })
})
