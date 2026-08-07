import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PgSQLAssetAdapter } from "../src/adapters/pgsql.js"

const connectionString = process.env.TRACE_TUTOR_TEST_PGSQL_URL
const liveDescribe = connectionString ? describe : describe.skip

liveDescribe("PgSQLAssetAdapter live", () => {
  let adapter: PgSQLAssetAdapter

  beforeAll(() => {
    adapter = new PgSQLAssetAdapter(connectionString!)
  })

  afterAll(async () => {
    await adapter.close()
  })

  it("在完整资产和批准证据写入后激活变式题", async () => {
    const uniqueStem = `计算极限：当 x 趋于 0 时，sin(2x)/(2x) 的极限。测试标识 ${randomUUID()}`
    const result = await adapter.execute(
      "asset.create_question",
      {
        user_id: "live-test-user",
        session_id: "live-test-session",
        stem: uniqueStem,
        answer: "1",
        analysis: "令 u=2x；当 x 趋于 0 时 u 也趋于 0，使用基本极限 sin(u)/u=1。",
        source_type: "ai_generated",
        source_reference: "60000000-0000-0000-0000-000000000001",
        proposed_knowledge_point_ids: [
          "40000000-0000-0000-0000-000000000002"
        ],
        proposed_method_ids: [
          "50000000-0000-0000-0000-000000000001"
        ]
      },
      {
        requestId: "live-variant-request",
        userId: "live-test-user",
        sessionId: "live-test-session"
      }
    )

    expect(result.meta).toMatchObject({
      source: "pgsql",
      status: "ok",
      reason: "题目已直接录入正式题库"
    })
    const questionId = String(result.result?.question_id)
    const persisted = await adapter.pool.query<{
      status: string
      review_status: string
      solution_status: string
      version_count: string
      variant_count: string
    }>(
      `SELECT q.status,
              (SELECT review_status FROM asset_review_log
                WHERE asset_type='question' AND asset_id=q.id
                ORDER BY created_at DESC,id DESC LIMIT 1) AS review_status,
              (SELECT status FROM solution_asset
                WHERE question_id=q.id AND is_primary LIMIT 1) AS solution_status,
              (SELECT count(*)::text FROM question_version
                WHERE question_id=q.id) AS version_count,
              (SELECT count(*)::text FROM question_variant_edge
                WHERE variant_question_id=q.id
                  AND base_question_id='60000000-0000-0000-0000-000000000001') AS variant_count
         FROM question_asset q WHERE q.id=$1`,
      [questionId]
    )

    expect(persisted.rows[0]).toEqual({
      status: "active",
      review_status: "approved",
      solution_status: "active",
      version_count: "1",
      variant_count: "1"
    })
  })

  it("将用户新题自动写入正式题库", async () => {
    const uniqueStem = `用户新题：计算当 x 趋于 0 时，tan(x)/x 的极限。测试标识 ${randomUUID()}`
    const report = await adapter.writeUserQuestion({
      userId: "live-test-user",
      sessionId: "live-user-question-session",
      workflowRunId: "live-user-question-workflow",
      requestId: "live-user-question-request",
      question: {
        schemaVersion: "1.0",
        externalId: "live-user-question-request",
        source: {
          type: "user_submitted",
          title: "TraceTutor 用户提问",
          reference: "session:live-user-question-session"
        },
        subject: {
          code: "math.higher",
          chapter_code: "math.higher.vol1.limit"
        },
        title: "用户提交的基本极限",
        stem: uniqueStem,
        questionType: "calculation",
        difficultyLevel: 2,
        answers: [
          {
            answer_type: "numeric",
            answer_text: "1",
            is_primary: true
          }
        ],
        solutions: [
          {
            title: "利用基本极限",
            solution_type: "teaching",
            text: "tan(x)/x=(sin(x)/x)/cos(x)，极限为 1。",
            main_method_code: "method.limit.equivalent",
            is_primary: true,
            steps: [
              {
                order: 1,
                role: "transform",
                text: "把 tan(x)/x 改写为 (sin(x)/x)/cos(x)。",
                method_code: "method.limit.equivalent"
              },
              {
                order: 2,
                role: "conclude",
                text: "分别取极限得到结果 1。"
              }
            ]
          }
        ],
        knowledgePoints: [
          {
            id: "40000000-0000-0000-0000-000000000002",
            code: "hm.limit.function",
            role: "primary",
            confidence: 0.9,
            source: "ai"
          }
        ],
        methods: [
          {
            id: "50000000-0000-0000-0000-000000000001",
            code: "method.limit.equivalent",
            role: "primary",
            confidence: 0.9,
            source: "ai"
          }
        ],
        unresolvedKnowledgeCodes: [],
        unresolvedMethodCodes: [],
        canonicalHash: "live-user-question-hash",
        status: "active",
        metadata: {
          source_session_id: "live-user-question-session",
          source_workflow_run_id: "live-user-question-workflow"
        },
        reviewNotes: []
      }
    })

    expect(report).toMatchObject({
      status: "active_created",
      reason: "已写入正式题库"
    })
    const persisted = await adapter.pool.query<{
      status: string
      review_status: string
      session_id: string
    }>(
      `SELECT q.status,
              (SELECT review_status FROM asset_review_log
                WHERE asset_type='question' AND asset_id=q.id
                ORDER BY created_at DESC,id DESC LIMIT 1) AS review_status,
              q.metadata->>'source_session_id' AS session_id
         FROM question_asset q WHERE q.id=$1`,
      [report.questionId]
    )
    expect(persisted.rows[0]).toEqual({
      status: "active",
      review_status: "approved",
      session_id: "live-user-question-session"
    })
  })
})
