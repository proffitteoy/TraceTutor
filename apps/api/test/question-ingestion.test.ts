import { describe, expect, it } from "vitest"
import type {
  JsonGenerationRequest,
  LocalModel,
  ModelHealth
} from "../src/agent/local-model.js"
import { LocalAgentRuntime } from "../src/agent/local-agent.js"
import { QuestionIngestionService } from "../src/ingestion/question-ingestion.js"
import type {
  QuestionIngestionPort,
  ImportBatchStart,
  ImportItemWrite,
  ImportItemWriteResult,
  ReviewQueueQuery,
  UserQuestionWrite
} from "../src/ports.js"
import type {
  QuestionDepositReport,
  ReviewDecision,
  TagDictionary
} from "../src/ingestion/contracts.js"

const KNOWLEDGE_ID = "11111111-1111-4111-8111-111111111111"
const METHOD_ID = "22222222-2222-4222-8222-222222222222"

class ScriptedModel implements LocalModel {
  readonly calls: string[] = []

  constructor(private readonly outputs: Record<string, unknown>) {}

  async health(): Promise<ModelHealth> {
    return { ready: true, detail: "ready" }
  }

  async generateJson<T>(request: JsonGenerationRequest<T>): Promise<T> {
    this.calls.push(request.name)
    return request.schema.parse(this.outputs[request.name])
  }
}

class RecordingIngestionPort implements QuestionIngestionPort {
  readonly importItems: ImportItemWrite[] = []
  readonly drafts: UserQuestionWrite[] = []
  finished = false
  reviewed?: ReviewDecision

  readonly dictionary: TagDictionary = {
    knowledge_points: [
      {
        id: KNOWLEDGE_ID,
        code: "function_limit",
        name: "函数极限",
        subject_code: "higher_math"
      }
    ],
    methods: [
      {
        id: METHOD_ID,
        code: "equivalent_infinitesimal",
        name: "等价无穷小"
      }
    ]
  }

  async loadTaggingContext(): Promise<TagDictionary> {
    return this.dictionary
  }

  async beginImportBatch(
    _input: ImportBatchStart
  ): Promise<{ batchId: string }> {
    return { batchId: "B1" }
  }

  async recordImportItem(
    input: ImportItemWrite
  ): Promise<ImportItemWriteResult> {
    this.importItems.push(input)
    return input.outcome === "imported"
      ? {
          outcome: "imported",
          questionId: "Q1",
          reviewItemId: "R1"
        }
      : { outcome: "failed" }
  }

  async finishImportBatch(): Promise<void> {
    this.finished = true
  }

  async writeUserQuestion(
    input: UserQuestionWrite
  ): Promise<QuestionDepositReport> {
    this.drafts.push(input)
    return {
      status: "active_created",
      reason: "已写入正式题库",
      questionId: "Q2",
      reviewItemId: "R2"
    }
  }

  async listReviewQueue(_query: ReviewQueueQuery) {
    return { items: [] }
  }

  async applyReview(
    reviewItemId: string,
    decision: ReviewDecision
  ) {
    this.reviewed = decision
    return {
      reviewItemId,
      questionId: "Q1",
      reviewStatus: "approved" as const,
      questionStatus: "active" as const
    }
  }
}

const importedQuestion = {
  schema_version: "1.0",
  external_id: "limit-000001",
  source: {
    type: "manual",
    title: "高等数学自建题库",
    reference: "chapter-01",
    license_note: "内部使用"
  },
  subject: {
    code: "higher_math",
    chapter_code: "function_limit"
  },
  title: "等价无穷小求极限",
  stem: "求极限：$$\\lim_{x\\to0}\\frac{\\sin x}{x}$$",
  question_type: "calculation",
  difficulty_level: 2,
  answers: [
    {
      answer_type: "numeric",
      answer_text: "1",
      is_primary: true
    }
  ],
  solutions: [
    {
      title: "等价无穷小",
      solution_type: "teaching",
      main_method_code: "equivalent_infinitesimal",
      is_primary: true,
      steps: [
        {
          order: 1,
          role: "apply_method",
          text: "使用 $\\sin x\\sim x$。"
        }
      ]
    }
  ],
  knowledge_points: [
    {
      code: "function_limit",
      role: "primary",
      confidence: 1
    }
  ],
  methods: [
    {
      code: "equivalent_infinitesimal",
      role: "primary",
      confidence: 1
    }
  ],
  status: "imported",
  metadata: {
    language: "zh",
    estimated_time_minutes: 3,
    has_image: false
  }
}

const aiTagging = {
  knowledge_points: [
    {
      code: "function_limit",
      role: "secondary",
      confidence: 0.8
    }
  ],
  methods: [
    {
      code: "invented_method",
      role: "alternative",
      confidence: 0.9
    }
  ],
  estimated_time_minutes: 3,
  structure_codes: ["basic_limit"],
  formula_warnings: [],
  review_notes: ["复核主方法"]
}

describe("QuestionIngestionService", () => {
  it("批量导入时校验 JSONL、映射标签 UUID 并保持 imported", async () => {
    const model = new ScriptedModel({
      question_import_tagging: aiTagging
    })
    const port = new RecordingIngestionPort()
    const service = new QuestionIngestionService(model, port)

    const summary = await service.importChunk(
      {
        batch_key: "batch-key",
        batch_name: "极限首批题库",
        source_type: "jsonl",
        final_chunk: true,
        items: [
          {
            line_number: 1,
            raw_text: JSON.stringify(importedQuestion),
            raw_json: importedQuestion
          }
        ]
      },
      { requestId: "REQ1" }
    )

    expect(summary).toMatchObject({
      imported: 1,
      duplicates: 0,
      failed: 0,
      finalChunk: true
    })
    expect(port.finished).toBe(true)
    expect(port.importItems[0]?.question).toMatchObject({
      status: "imported",
      unresolvedMethodCodes: ["invented_method"]
    })
    expect(port.importItems[0]?.question?.knowledgePoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: KNOWLEDGE_ID, source: "provided" })
      ])
    )
    expect(port.importItems[0]?.question?.methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: METHOD_ID, source: "provided" })
      ])
    )
    expect(port.importItems[0]?.question?.canonicalHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("非法行写入 staging 失败记录，不调用 AI", async () => {
    const model = new ScriptedModel({})
    const port = new RecordingIngestionPort()
    const service = new QuestionIngestionService(model, port)

    const summary = await service.importChunk(
      {
        batch_key: "batch-key",
        batch_name: "坏数据",
        source_type: "jsonl",
        final_chunk: false,
        items: [
          {
            line_number: 9,
            raw_text: "{\"status\":\"active\"}",
            raw_json: { status: "active" }
          }
        ]
      },
      { requestId: "REQ2" }
    )

    expect(summary.failed).toBe(1)
    expect(model.calls).toEqual([])
    expect(port.importItems[0]).toMatchObject({
      lineNumber: 9,
      outcome: "failed"
    })
  })

  it("用户新题直接存入正式题库，并记录会话来源", async () => {
    const normalizedUserQuestion = {
        subject: {
          code: "basis_and_linear_maps",
          chapter_code: "function_limit"
        },
        title: "基本极限",
        stem: importedQuestion.stem,
        question_type: "calculation",
        difficulty_level: 2,
        answers: importedQuestion.answers,
        solutions: importedQuestion.solutions,
        knowledge_points: importedQuestion.knowledge_points.map(label => ({
          ...label,
          confidence: 0.9
        })),
        methods: importedQuestion.methods.map(label => ({
          ...label,
          confidence: 0.9
        })),
        estimated_time_minutes: 3,
        structure_codes: ["basic_limit"],
        review_notes: ["检查 LaTeX"]
      }
    const model = new ScriptedModel({
      user_question_deposit: normalizedUserQuestion
    })
    const port = new RecordingIngestionPort()
    const service = new QuestionIngestionService(model, port)

    const report = await service.depositUserQuestion({
      userId: "U1",
      sessionId: "S1",
      requestId: "REQ3",
      workflowRunId: "W1",
      userText: importedQuestion.stem,
      teachingOutput: { summary: "答案为 1" }
    })

    expect(report.status).toBe("active_created")
    expect(port.drafts[0]).toMatchObject({
      question: {
        status: "active",
        externalId: "user-request:REQ3",
        source: { type: "user_submitted" },
        metadata: {
          source_user_id: "U1",
          source_session_id: "S1",
          source_workflow_run_id: "W1"
        },
        subject: { code: "higher_math" },
        reviewNotes: expect.arrayContaining([
          "学科 code 已从 basis_and_linear_maps 纠正为 higher_math"
        ])
      }
    })
  })

  it("LocalAgentRuntime 在讲解完成后自动沉淀用户新题", async () => {
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
        summary: "该极限等于 1。",
        cards: [
          {
            type: "solution",
            title: "解题",
            content: "使用等价无穷小。",
            steps: ["使用 $\\sin x\\sim x$。"],
            methods: ["等价无穷小"]
          },
          {
            type: "new_question",
            title: "当前新题",
            question_id: "MODEL-INVENTED-ID",
            content: importedQuestion.stem
          }
        ],
        actions: [{
          type: "request_hint",
          label: "给我提示",
          question_id: "MODEL-INVENTED-ID"
        }]
      },
      user_question_deposit: {
        subject: {
          code: "higher_math",
          chapter_code: "function_limit"
        },
        title: "基本极限",
        stem: importedQuestion.stem,
        question_type: "calculation",
        difficulty_level: 2,
        answers: importedQuestion.answers,
        solutions: importedQuestion.solutions,
        knowledge_points: importedQuestion.knowledge_points.map(label => ({
          ...label,
          confidence: 0.9
        })),
        methods: importedQuestion.methods.map(label => ({
          ...label,
          confidence: 0.9
        })),
        estimated_time_minutes: 3,
        structure_codes: ["basic_limit"],
        review_notes: []
      }
    })
    const port = new RecordingIngestionPort()
    const ingestion = new QuestionIngestionService(model, port)
    const runtime = new LocalAgentRuntime(model, undefined, ingestion)

    const response = await runtime.run(
      {
        user_id: "U1",
        session_id: "S1",
        input_mode: "new_question",
        user_text: importedQuestion.stem,
        attachments: [],
        active_question_id: null
      },
      { requestId: "REQ-AUTO" }
    )

    expect(response.meta.question_deposit).toEqual({
      status: "active_created",
      reason: "已写入正式题库",
      question_id: "Q2",
      review_item_id: "R2"
    })
    expect(response.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "new_question",
        question_id: "Q2"
      })
    ]))
    expect(response.actions).toEqual([
      expect.objectContaining({
        type: "request_hint",
        question_id: "Q2"
      })
    ])
    expect(model.calls).toEqual([
      "query_plan",
      "teaching_output",
      "user_question_deposit"
    ])
  })

  it("澄清和操作指令不会被误当成新题自动入库", async () => {
    const model = new ScriptedModel({
      query_plan: {
        version: "1.0",
        intent: "CLARIFY_INTENT",
        task_types: ["CLARIFY_INTENT"],
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
        summary: "需要当前题目上下文。",
        cards: [{
          type: "method_summary",
          title: "请指定题目",
          content: "请选择当前题目。"
        }],
        actions: []
      }
    })
    const ingestion = new QuestionIngestionService(
      model,
      new RecordingIngestionPort()
    )
    const runtime = new LocalAgentRuntime(model, undefined, ingestion)

    const response = await runtime.run({
      user_id: "U1",
      session_id: "S-follow-up",
      input_mode: "free_chat",
      user_text: "我需要相似题",
      attachments: [],
      active_question_id: null
    }, { requestId: "REQ-FOLLOW-UP" })

    expect(response.meta.question_deposit).toBeUndefined()
    expect(model.calls).toEqual(["query_plan", "teaching_output"])
  })

  it("人工 approve 决策由 PgSQL 端口事务性应用", async () => {
    const port = new RecordingIngestionPort()
    const service = new QuestionIngestionService(
      new ScriptedModel({}),
      port
    )

    const result = await service.review(
      "R1",
      {
        reviewer: "reviewer@example",
        decision: "approve",
        review_note: "答案、主知识点和主方法已核对"
      },
      "REQ4"
    )

    expect(result).toMatchObject({
      reviewStatus: "approved",
      questionStatus: "active"
    })
    expect(port.reviewed?.decision).toBe("approve")
  })
})
