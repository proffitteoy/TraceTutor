import { Pool, type PoolClient, type QueryResultRow } from "pg"
import type { ToolName, ToolResult } from "../contracts.js"
import type {
  ImportBatchStart,
  ImportItemWrite,
  ImportItemWriteResult,
  PracticeQuestionCatalogPort,
  PracticeQuestionSummary,
  QuestionIngestionPort,
  RequestContext,
  ReviewApplyResult,
  ReviewQueuePage,
  ReviewQueueQuery,
  TaggingContextQuery,
  ToolExecutionHealth,
  ToolExecutionPort,
  UserQuestionWrite
} from "../ports.js"
import type {
  PersistableQuestion,
  QuestionDepositReport,
  ReviewDecision,
  TagDictionary
} from "../ingestion/contracts.js"

const capabilities = new Set<ToolName>([
  "asset.get_question_detail",
  "asset.search_by_knowledge",
  "asset.search_by_method",
  "asset.search_same_knowledge_different_method",
  "asset.search_same_method_different_knowledge",
  "asset.search_similar_questions",
  "asset.create_question",
  "asset.get_solution_steps"
])

type Input = Readonly<Record<string, unknown>>

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback
}

function difficulty(policy: unknown, base = 3): [number, number] {
  if (policy === "easier") return [1, Math.max(1, base - 1)]
  if (policy === "harder") return [Math.min(5, base + 1), 5]
  return [Math.max(1, base - 1), Math.min(5, base + 1)]
}

function result(
  requestId: string,
  rows: Record<string, unknown>[],
  reason: string
): ToolResult {
  return {
    items: rows,
    meta: {
      source: "pgsql",
      status: rows.length ? "ok" : "empty",
      reason,
      request_id: requestId
    }
  }
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const value = await operation(client)
    await client.query("COMMIT")
    return value
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function questionSummary(
  client: Pool | PoolClient,
  sql: string,
  parameters: unknown[]
): Promise<Record<string, unknown>[]> {
  const query = await client.query<QueryResultRow>(
    `SELECT q.id::text AS question_id, q.title, q.stem, q.question_type,
            q.difficulty_level, q.origin_type, q.metadata,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
              'id', kp.id::text, 'code', kp.code, 'name', kp.name, 'role', qkp.role
            )) FILTER (WHERE kp.id IS NOT NULL), '[]'::jsonb) AS knowledge_points,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
              'id', m.id::text, 'code', m.code, 'name', m.name, 'role', qm.role
            )) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS methods
       FROM question_asset q
       LEFT JOIN question_knowledge_point qkp ON qkp.question_id = q.id
       LEFT JOIN knowledge_point kp ON kp.id = qkp.knowledge_point_id
       LEFT JOIN question_method qm ON qm.question_id = q.id
       LEFT JOIN method_asset m ON m.id = qm.method_id
      WHERE q.status = 'active' AND q.is_public AND (${sql})
      GROUP BY q.id
      ORDER BY q.difficulty_level, q.created_at DESC
      LIMIT $${parameters.length}`,
    parameters
  )
  return query.rows as Record<string, unknown>[]
}

function sourceType(question: PersistableQuestion): string {
  return question.source.type === "external_import"
    ? "external_import"
    : question.source.type
}

function originType(question: PersistableQuestion): string {
  if (question.source.type === "user_submitted") return "user_submitted"
  if (question.source.type === "ai_generated") return "ai_generated"
  if (question.status === "imported") return "external_import"
  return "manual"
}

async function persistQuestion(
  client: PoolClient,
  question: PersistableQuestion,
  activateApproved = false,
  approvalSource = "explicit_user_approval"
): Promise<{ outcome: "imported" | "duplicate"; questionId: string; reviewItemId: string }> {
  const duplicate = await client.query<{ id: string }>(
    "SELECT id::text AS id FROM question_asset WHERE canonical_hash = normalized_question_hash($1) LIMIT 1",
    [question.stem]
  )
  if (duplicate.rowCount) {
    return {
      outcome: "duplicate",
      questionId: duplicate.rows[0]!.id,
      reviewItemId: ""
    }
  }

  const subject = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM subject_domain
     WHERE code = ANY($1::text[])
     ORDER BY code = $2 DESC LIMIT 1`,
    [
      [question.subject.chapter_code, question.subject.code].filter(Boolean),
      question.subject.chapter_code ?? question.subject.code
    ]
  )
  if (!subject.rowCount) throw new Error(`未知学科 code：${question.subject.code}`)

  const source = await client.query<{ id: string }>(
    `INSERT INTO source_asset(source_type, title, external_url, license_note, raw_metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id::text AS id`,
    [
      sourceType(question),
      question.source.title,
      question.source.reference ?? null,
      question.source.license_note ?? null,
      JSON.stringify({ external_id: question.externalId })
    ]
  )

  // Always insert as draft first to bypass BEFORE INSERT trigger validation,
  // then promote to active after related data is inserted.
  const wantsActive = question.status === "active" || activateApproved
  const initialStatus = wantsActive ? "draft" : question.status

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO question_asset(
       source_id, subject_id, title, stem, question_type, difficulty_level,
       status, origin_type, canonical_hash, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING id::text AS id`,
    [
      source.rows[0]!.id,
      subject.rows[0]!.id,
      question.title,
      question.stem,
      question.questionType,
      question.difficultyLevel,
      initialStatus,
      originType(question),
      question.canonicalHash,
      JSON.stringify({
        ...question.metadata,
        schema_version: question.schemaVersion,
        external_id: question.externalId,
        unresolved_knowledge_codes: question.unresolvedKnowledgeCodes,
        unresolved_method_codes: question.unresolvedMethodCodes,
        review_notes: question.reviewNotes,
        ingestion_payload: question
      })
    ]
  )
  const questionId = inserted.rows[0]!.id
  await client.query(
    `INSERT INTO question_version(question_id, version_no, stem, change_note, created_by)
     VALUES ($1, 1, $2, '初次摄取', 'tracetutor-api')`,
    [questionId, question.stem]
  )
  for (const answer of question.answers) {
    await client.query(
      `INSERT INTO answer_asset(question_id, answer_text, answer_type, is_primary)
       VALUES ($1, $2, $3, $4)`,
      [questionId, answer.answer_text, answer.answer_type, answer.is_primary]
    )
  }
  for (const solution of question.solutions) {
    const mainMethod = solution.main_method_code
      ? await client.query<{ id: string }>(
          "SELECT id::text AS id FROM method_asset WHERE code = $1",
          [solution.main_method_code]
        )
      : undefined
    const solutionRow = await client.query<{ id: string }>(
      `INSERT INTO solution_asset(
         question_id, title, solution_text, solution_type, main_method_id,
         is_primary, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'reviewed')
       RETURNING id::text AS id`,
      [
        questionId,
        solution.title,
        solution.text ?? solution.steps.map(step => step.text).join("\n"),
        solution.solution_type,
        mainMethod?.rows[0]?.id ?? null,
        solution.is_primary
      ]
    )
    for (const step of solution.steps) {
      const kp = step.knowledge_point_code
        ? await client.query<{ id: string }>(
            "SELECT id::text AS id FROM knowledge_point WHERE code = $1",
            [step.knowledge_point_code]
          )
        : undefined
      const method = step.method_code
        ? await client.query<{ id: string }>(
            "SELECT id::text AS id FROM method_asset WHERE code = $1",
            [step.method_code]
          )
        : undefined
      await client.query(
        `INSERT INTO solution_step(
           solution_id, step_order, step_title, step_text, step_role,
           knowledge_point_id, method_id, formula_text
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          solutionRow.rows[0]!.id,
          step.order,
          step.title ?? null,
          step.text,
          step.role,
          kp?.rows[0]?.id ?? null,
          method?.rows[0]?.id ?? null,
          step.formula_text ?? null
        ]
      )
    }
  }
  for (const label of question.knowledgePoints) {
    await client.query(
      `INSERT INTO question_knowledge_point(
         question_id, knowledge_point_id, role, confidence
       ) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [questionId, label.id, label.role, label.confidence]
    )
  }
  for (const label of question.methods) {
    await client.query(
      `INSERT INTO question_method(question_id, method_id, role, confidence)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [questionId, label.id, label.role, label.confidence]
    )
  }
  for (const code of strings(question.metadata.structure_codes)) {
    await client.query(
      `INSERT INTO question_structure_feature(question_id, structure_code)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [questionId, code]
    )
  }
  const review = await client.query<{ id: string }>(
    `INSERT INTO asset_review_log(
       asset_type, asset_id, review_status, review_note
     ) VALUES ('question', $1, $2, $3)
     RETURNING id::text AS id`,
    [
      questionId,
      (activateApproved || wantsActive) ? "approved" : "pending",
      activateApproved
        ? `初始化批准：${approvalSource}`
        : wantsActive
          ? "自动批准：用户提问直接入库"
          : question.reviewNotes.join("\n") || "等待人工复核"
    ]
  )
  if (wantsActive) {
    await client.query(
      "UPDATE solution_asset SET status='active' WHERE question_id=$1 AND is_primary",
      [questionId]
    )
    await client.query(
      "UPDATE question_asset SET status='active' WHERE id=$1",
      [questionId]
    )
  }
  return {
    outcome: "imported",
    questionId,
    reviewItemId: review.rows[0]!.id
  }
}

export class PgSQLAssetAdapter
  implements ToolExecutionPort, QuestionIngestionPort, PracticeQuestionCatalogPort
{
  readonly capabilities = capabilities
  readonly pool: Pool
  private lastIdleClientError: string | undefined

  constructor(connectionString: string, max = 10, timeoutMs = 5_000) {
    this.pool = new Pool({
      connectionString,
      max,
      connectionTimeoutMillis: timeoutMs,
      statement_timeout: timeoutMs,
      options: "-c search_path=pg_catalog,public"
    })
    this.pool.on("error", error => {
      // pg-pool emits idle connection failures as EventEmitter errors. Without
      // a listener, a PostgreSQL restart terminates the whole API process.
      // The failed client is already discarded by pg-pool; the next query can
      // reconnect normally, so retain only a concise diagnostic here.
      this.lastIdleClientError = error.message
    })
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async health(): Promise<ToolExecutionHealth> {
    try {
      const value = await this.pool.query<{ ok: number }>(
        "SELECT 1 AS ok FROM pg_catalog.pg_class WHERE relname = 'question_asset'"
      )
      this.lastIdleClientError = undefined
      return value.rowCount
        ? { ready: true, detail: "PostgreSQL 题目资产库已就绪" }
        : { ready: false, detail: "PostgreSQL 迁移尚未执行" }
    } catch (error) {
      return {
        ready: false,
        detail:
          error instanceof Error
            ? error.message
            : this.lastIdleClientError ?? "PostgreSQL 健康检查失败"
      }
    }
  }

  async listPracticeQuestions(input: {
    limit: number
    subjectCode?: string
  }): Promise<PracticeQuestionSummary[]> {
    const parameters: unknown[] = []
    const subjectFilter = input.subjectCode
      ? `AND subject.code = $${parameters.push(input.subjectCode)}`
      : ""
    parameters.push(input.limit)

    const questions = await this.pool.query<{
      question_id: string
      title: string | null
      stem: string
      question_type: string
      difficulty: number
      subject_code: string
      subject_name: string
    }>(
      `SELECT q.id::text AS question_id,
              COALESCE(NULLIF(q.title, ''), '未命名题目') AS title,
              q.stem,
              q.question_type,
              q.difficulty_level AS difficulty,
              subject.code AS subject_code,
              subject.name AS subject_name
         FROM question_asset q
         JOIN subject_domain subject ON subject.id = q.subject_id
        WHERE q.status = 'active'
          AND q.is_public
          AND EXISTS (
            SELECT 1
              FROM asset_review_log review
             WHERE review.asset_type = 'question'
               AND review.asset_id = q.id
               AND review.review_status = 'approved'
          )
          ${subjectFilter}
        ORDER BY subject.name, q.difficulty_level, q.created_at, q.id
        LIMIT $${parameters.length}`,
      parameters
    )

    return questions.rows.map(question => ({
      questionId: question.question_id,
      title: question.title ?? "未命名题目",
      stem: question.stem,
      questionType: question.question_type,
      difficulty: question.difficulty,
      subjectCode: question.subject_code,
      subjectName: question.subject_name
    }))
  }

  async execute(tool: ToolName, input: Input, context: RequestContext): Promise<ToolResult> {
    if (!this.capabilities.has(tool)) throw new Error(`PgSQL 不支持工具：${tool}`)
    const limit = numberValue(input.limit, 5)
    if (tool === "asset.get_question_detail") {
      const rows = await this.pool.query<QueryResultRow>(
        `SELECT q.id::text AS question_id, q.title, q.stem, q.question_type,
                q.difficulty_level, q.metadata,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', a.id::text, 'answer_text', a.answer_text,
                  'answer_type', a.answer_type, 'is_primary', a.is_primary
                ) ORDER BY a.is_primary DESC) FROM answer_asset a
                  WHERE a.question_id=q.id), '[]'::jsonb) AS answers,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', s.id::text, 'title', s.title, 'solution_text', s.solution_text,
                  'solution_type', s.solution_type, 'is_primary', s.is_primary
                ) ORDER BY s.is_primary DESC) FROM solution_asset s
                  WHERE s.question_id=q.id), '[]'::jsonb) AS solutions
           FROM question_asset q
          WHERE q.id=$1 AND q.status='active' AND q.is_public`,
        [input.question_id]
      )
      return result(context.requestId, rows.rows as Record<string, unknown>[], "题目详情")
    }
    if (tool === "asset.get_solution_steps") {
      const rows = await this.pool.query<QueryResultRow>(
        `SELECT step.id::text AS step_id, step.step_order, step.step_title,
                step.step_text, step.step_role, step.formula_text,
                step.knowledge_point_id::text, step.method_id::text
           FROM question_asset q
           JOIN solution_asset s ON s.question_id=q.id AND s.is_primary
           JOIN solution_step step ON step.solution_id=s.id
          WHERE q.id=$1 AND q.status='active' AND q.is_public
          ORDER BY step.step_order`,
        [input.question_id]
      )
      return result(context.requestId, rows.rows as Record<string, unknown>[], "主解析步骤")
    }
    if (tool === "asset.create_question") {
      const created = await transaction(this.pool, async client => {
        const subject = await client.query<{ id: string }>(
          "SELECT id::text AS id FROM subject_domain WHERE code='math' LIMIT 1"
        )
        if (!subject.rowCount) throw new Error("缺少 math 学科参考数据")
        const source = await client.query<{ id: string }>(
          `INSERT INTO source_asset(source_type,title,raw_metadata)
           VALUES ($1,'TraceTutor 工具创建题目',$2::jsonb) RETURNING id::text AS id`,
          [
            input.source_type === "user_input" ? "user_submitted" : input.source_type,
            JSON.stringify({ reference: input.source_reference ?? null })
          ]
        )
        const q = await client.query<{ id: string }>(
          `INSERT INTO question_asset(
             source_id,subject_id,title,stem,question_type,difficulty_level,status,origin_type,metadata
           ) VALUES ($1,$2,$3,$4,'essay',3,'active',$5,$6::jsonb)
           RETURNING id::text AS id`,
          [
            source.rows[0]!.id,
            subject.rows[0]!.id,
            input.title ?? 'TraceTutor 生成题目',
            input.stem,
            input.source_type,
            JSON.stringify({ request_id: context.requestId })
          ]
        )
        const questionId = q.rows[0]!.id
        await client.query(
          "INSERT INTO answer_asset(question_id,answer_text,is_primary) VALUES ($1,$2,true)",
          [questionId, input.answer]
        )
        const s = await client.query<{ id: string }>(
          `INSERT INTO solution_asset(
             question_id,title,solution_text,solution_type,is_primary,status
           ) VALUES ($1,'解析',$2,'teaching',true,'reviewed')
           RETURNING id::text AS id`,
          [questionId, input.analysis]
        )
        await client.query(
          `INSERT INTO solution_step(solution_id,step_order,step_text,step_role)
           VALUES ($1,1,$2,'conclude')`,
          [s.rows[0]!.id, input.analysis]
        )
        for (const id of strings(input.proposed_knowledge_point_ids)) {
          await client.query(
            `INSERT INTO question_knowledge_point(question_id,knowledge_point_id,role,confidence)
             SELECT $1,id,'primary',0.5 FROM knowledge_point WHERE id=$2
             ON CONFLICT DO NOTHING`,
            [questionId, id]
          )
        }
        for (const id of strings(input.proposed_method_ids)) {
          await client.query(
            `INSERT INTO question_method(question_id,method_id,role,confidence)
             SELECT $1,id,'primary',0.5 FROM method_asset WHERE id=$2
             ON CONFLICT DO NOTHING`,
            [questionId, id]
          )
        }
        const review = await client.query<{ id: string }>(
          `INSERT INTO asset_review_log(asset_type,asset_id,review_status,review_note)
           VALUES ('question',$1,'approved','题目直接录入正式题库')
           RETURNING id::text AS id`,
          [questionId]
        )
        return { question_id: questionId, review_item_id: review.rows[0]!.id, status: "active" }
      })
      return {
        result: created,
        meta: { source: "pgsql", status: "ok", reason: "题目已直接录入正式题库", request_id: context.requestId }
      }
    }

    if (tool === "asset.search_by_knowledge") {
      const ids = strings(input.knowledge_point_ids)
      const area = typeof input.knowledge_area === "string" ? input.knowledge_area : null
      const range = difficulty(input.difficulty_policy)
      const rows = await questionSummary(
        this.pool,
        `(q.difficulty_level BETWEEN $1 AND $2)
         AND q.id <> ALL($3::uuid[])
         AND EXISTS (
           SELECT 1 FROM question_knowledge_point x
           JOIN knowledge_point k ON k.id=x.knowledge_point_id
           JOIN subject_domain sd ON sd.id=k.subject_id
           WHERE x.question_id=q.id
             AND (x.knowledge_point_id=ANY($4::uuid[]) OR sd.code=$5 OR k.code=$5)
         )`,
        [range[0], range[1], strings(input.exclude_question_ids), ids, area, limit]
      )
      return result(context.requestId, rows, "按知识点召回")
    }
    if (tool === "asset.search_by_method") {
      const range = difficulty(input.difficulty_policy)
      const rows = await questionSummary(
        this.pool,
        `q.difficulty_level BETWEEN $1 AND $2
         AND q.id <> ALL($3::uuid[])
         AND EXISTS (SELECT 1 FROM question_method x
           WHERE x.question_id=q.id AND x.method_id=ANY($4::uuid[]))`,
        [range[0], range[1], strings(input.exclude_question_ids), strings(input.method_ids), limit]
      )
      return result(context.requestId, rows, "按方法召回")
    }

    const base = await this.pool.query<{ difficulty_level: number }>(
      "SELECT difficulty_level FROM question_asset WHERE id=$1 AND status='active' AND is_public",
      [input.base_question_id]
    )
    if (!base.rowCount) return result(context.requestId, [], "基准题不存在或未激活")
    const range = difficulty(input.difficulty_policy, base.rows[0]!.difficulty_level)
    if (tool === "asset.search_same_knowledge_different_method") {
      const rows = await questionSummary(
        this.pool,
        `q.id<>$1 AND q.difficulty_level BETWEEN $2 AND $3
         AND EXISTS (SELECT 1 FROM question_knowledge_point a
           JOIN question_knowledge_point b ON b.knowledge_point_id=a.knowledge_point_id
           WHERE a.question_id=$1 AND b.question_id=q.id)
         AND NOT EXISTS (SELECT 1 FROM question_method a
           JOIN question_method b ON b.method_id=a.method_id
           WHERE a.question_id=$1 AND b.question_id=q.id)
         AND NOT EXISTS (SELECT 1 FROM question_method e
           WHERE e.question_id=q.id AND e.method_id=ANY($4::uuid[]))`,
        [input.base_question_id, range[0], range[1], strings(input.exclude_method_ids), limit]
      )
      return result(context.requestId, rows, "同知识点不同方法")
    }
    if (tool === "asset.search_same_method_different_knowledge") {
      const rows = await questionSummary(
        this.pool,
        `q.id<>$1 AND q.difficulty_level BETWEEN $2 AND $3
         AND EXISTS (SELECT 1 FROM question_method a
           JOIN question_method b ON b.method_id=a.method_id
           WHERE a.question_id=$1 AND b.question_id=q.id)
         AND NOT EXISTS (SELECT 1 FROM question_knowledge_point a
           JOIN question_knowledge_point b ON b.knowledge_point_id=a.knowledge_point_id
           WHERE a.question_id=$1 AND b.question_id=q.id)
         AND NOT EXISTS (SELECT 1 FROM question_knowledge_point e
           WHERE e.question_id=q.id AND e.knowledge_point_id=ANY($4::uuid[]))`,
        [input.base_question_id, range[0], range[1], strings(input.exclude_knowledge_point_ids), limit]
      )
      return result(context.requestId, rows, "同方法不同知识点")
    }
    const dimensions = strings(input.similarity_dimensions)
    const rows = await questionSummary(
      this.pool,
      `q.id<>$1 AND q.difficulty_level BETWEEN $2 AND $3
       AND EXISTS (SELECT 1 FROM question_similarity_edge edge
         WHERE edge.source_question_id=$1 AND edge.target_question_id=q.id
           AND edge.similarity_type=ANY($4::text[]) AND edge.status='active')`,
      [input.base_question_id, range[0], range[1], dimensions, limit]
    )
    return result(context.requestId, rows, "多维相似题召回")
  }

  async loadTaggingContext(query: TaggingContextQuery): Promise<TagDictionary> {
    const knowledge = await this.pool.query<QueryResultRow>(
      `SELECT kp.id::text AS id,kp.code,kp.name,sd.code AS subject_code
       FROM knowledge_point kp JOIN subject_domain sd ON sd.id=kp.subject_id
       WHERE kp.status='active' AND ($1::text IS NULL OR sd.code=$1 OR kp.code=ANY($2::text[]))
       ORDER BY kp.code LIMIT 500`,
      [query.subjectCode ?? null, query.proposedKnowledgeCodes]
    )
    const methods = await this.pool.query<QueryResultRow>(
      `SELECT id::text AS id,code,name FROM method_asset
       WHERE status='active'
         AND (cardinality($1::text[]) = 0 OR code=ANY($1::text[]))
       ORDER BY code LIMIT 500`,
      [query.proposedMethodCodes]
    )
    return {
      knowledge_points: knowledge.rows as TagDictionary["knowledge_points"],
      methods: methods.rows as TagDictionary["methods"]
    }
  }

  async beginImportBatch(input: ImportBatchStart): Promise<{ batchId: string }> {
    const row = await this.pool.query<{ id: string }>(
      `INSERT INTO import_batch(batch_key,batch_name,source_type,source_uri,status)
       VALUES ($1,$2,$3,$4,'processing')
       ON CONFLICT(batch_key) DO UPDATE SET batch_name=EXCLUDED.batch_name
       RETURNING id::text AS id`,
      [input.batchKey, input.batchName, input.sourceType, input.sourceUri ?? null]
    )
    return { batchId: row.rows[0]!.id }
  }

  async recordImportItem(input: ImportItemWrite): Promise<ImportItemWriteResult> {
    return transaction(this.pool, async client => {
      const existing = await client.query<QueryResultRow>(
        `SELECT parse_status,created_question_id::text AS question_id
         FROM staging_question_raw WHERE batch_id=$1 AND line_number=$2`,
        [input.batchId, input.lineNumber]
      )
      if (existing.rowCount) {
        const row = existing.rows[0]!
        if (row.parse_status === "failed" && input.outcome === "imported") {
          await client.query(
            "DELETE FROM staging_question_raw WHERE batch_id=$1 AND line_number=$2",
            [input.batchId, input.lineNumber]
          )
          await client.query(
            `UPDATE import_batch
             SET total_count=greatest(total_count-1,0),
                 failed_count=greatest(failed_count-1,0)
             WHERE id=$1`,
            [input.batchId]
          )
        } else {
        return {
          outcome: row.parse_status === "parsed" ? "duplicate" : "failed",
          ...(row.question_id ? { questionId: String(row.question_id) } : {})
        }
        }
      }
      if (input.outcome === "failed" || !input.question) {
        await client.query(
          `INSERT INTO staging_question_raw(
             batch_id,line_number,raw_text,raw_json,parse_status,error_message
           ) VALUES ($1,$2,$3,$4::jsonb,'failed',$5)`,
          [input.batchId, input.lineNumber, input.rawText, JSON.stringify(input.rawJson ?? {}), input.errorMessage ?? "解析失败"]
        )
        await client.query(
          `UPDATE import_batch SET total_count=total_count+1,failed_count=failed_count+1
           WHERE id=$1`,
          [input.batchId]
        )
        return { outcome: "failed" }
      }
      const saved = await persistQuestion(
        client,
        input.question,
        input.activateApproved ?? false,
        input.approvalSource
      )
      await client.query(
        `INSERT INTO staging_question_raw(
           batch_id,line_number,raw_text,raw_json,parse_status,canonical_hash,created_question_id
         ) VALUES ($1,$2,$3,$4::jsonb,$5,normalized_question_hash($6),$7)`,
        [
          input.batchId, input.lineNumber, input.rawText,
          JSON.stringify(input.rawJson ?? {}), saved.outcome === "duplicate" ? "duplicate" : "parsed",
          input.question.stem, saved.questionId
        ]
      )
      await client.query(
        `UPDATE import_batch SET total_count=total_count+1,
           success_count=success_count+1 WHERE id=$1`,
        [input.batchId]
      )
      return {
        outcome: saved.outcome,
        questionId: saved.questionId,
        ...(saved.reviewItemId ? { reviewItemId: saved.reviewItemId } : {})
      }
    })
  }

  async finishImportBatch(batchId: string): Promise<void> {
    await this.pool.query(
      `UPDATE import_batch SET status='completed',completed_at=now() WHERE id=$1`,
      [batchId]
    )
  }

  async writeUserQuestion(input: UserQuestionWrite): Promise<QuestionDepositReport> {
    const saved = await transaction(this.pool, client => persistQuestion(client, input.question))
    return saved.outcome === "duplicate"
      ? { status: "duplicate", reason: "题干规范化哈希已存在", questionId: saved.questionId }
      : {
          status: "active_created",
          reason: "已写入正式题库",
          questionId: saved.questionId,
          reviewItemId: saved.reviewItemId
        }
  }

  async listReviewQueue(query: ReviewQueueQuery): Promise<ReviewQueuePage> {
    const cursor = query.cursor ? new Date(Buffer.from(query.cursor, "base64url").toString("utf8")) : null
    const rows = await this.pool.query<QueryResultRow>(
      `SELECT r.id::text AS review_item_id,q.id::text AS question_id,
              r.review_status,q.status AS origin_status,q.metadata->'ingestion_payload' AS question,
              r.created_at
       FROM asset_review_log r JOIN question_asset q ON q.id=r.asset_id
       WHERE r.asset_type='question' AND r.review_status=$1
         AND ($2::timestamptz IS NULL OR r.created_at<$2)
       ORDER BY r.created_at DESC LIMIT $3`,
      [query.status, cursor?.toISOString() ?? null, query.limit + 1]
    )
    const hasMore = rows.rows.length > query.limit
    const selected = rows.rows.slice(0, query.limit)
    return {
      items: selected.map((row: QueryResultRow) => ({
        reviewItemId: String(row.review_item_id),
        questionId: String(row.question_id),
        status: row.review_status as "pending" | "needs_fix",
        originStatus: row.origin_status as "imported" | "draft",
        question: row.question as PersistableQuestion,
        createdAt: new Date(String(row.created_at)).toISOString()
      })),
      ...(hasMore
        ? {
            nextCursor: Buffer.from(
              new Date(String(selected.at(-1)!.created_at)).toISOString()
            ).toString("base64url")
          }
        : {})
    }
  }

  async applyReview(
    reviewItemId: string,
    decision: ReviewDecision,
    requestId: string
  ): Promise<ReviewApplyResult> {
    return transaction(this.pool, async client => {
      const review = await client.query<{ question_id: string; question_status: string }>(
        `SELECT q.id::text AS question_id,q.status AS question_status
         FROM asset_review_log r JOIN question_asset q ON q.id=r.asset_id
         WHERE r.id=$1 AND r.asset_type='question' FOR UPDATE OF r,q`,
        [reviewItemId]
      )
      if (!review.rowCount) throw new Error("复核项不存在")
      const questionId = review.rows[0]!.question_id
      const c = decision.corrections
      if (c) {
        await client.query(
          `UPDATE question_asset SET title=COALESCE($2,title),stem=COALESCE($3,stem),
             question_type=COALESCE($4,question_type),difficulty_level=COALESCE($5,difficulty_level)
           WHERE id=$1`,
          [questionId, c.title ?? null, c.stem ?? null, c.question_type ?? null, c.difficulty_level ?? null]
        )
        if (c.answers) {
          await client.query("DELETE FROM answer_asset WHERE question_id=$1", [questionId])
          for (const answer of c.answers) {
            await client.query(
              `INSERT INTO answer_asset(question_id,answer_text,answer_type,is_primary)
               VALUES ($1,$2,$3,$4)`,
              [questionId, answer.answer_text, answer.answer_type, answer.is_primary]
            )
          }
        }
        if (c.solutions) {
          await client.query("DELETE FROM solution_asset WHERE question_id=$1", [questionId])
          for (const solution of c.solutions) {
            const mainMethod = solution.main_method_code
              ? await client.query<{ id: string }>(
                  "SELECT id::text AS id FROM method_asset WHERE code=$1",
                  [solution.main_method_code]
                )
              : undefined
            const insertedSolution = await client.query<{ id: string }>(
              `INSERT INTO solution_asset(
                 question_id,title,solution_text,solution_type,main_method_id,
                 is_primary,status
               ) VALUES ($1,$2,$3,$4,$5,$6,'reviewed')
               RETURNING id::text AS id`,
              [
                questionId,
                solution.title,
                solution.text ?? solution.steps.map(step => step.text).join("\n"),
                solution.solution_type,
                mainMethod?.rows[0]?.id ?? null,
                solution.is_primary
              ]
            )
            for (const step of solution.steps) {
              const kp = step.knowledge_point_code
                ? await client.query<{ id: string }>(
                    "SELECT id::text AS id FROM knowledge_point WHERE code=$1",
                    [step.knowledge_point_code]
                  )
                : undefined
              const method = step.method_code
                ? await client.query<{ id: string }>(
                    "SELECT id::text AS id FROM method_asset WHERE code=$1",
                    [step.method_code]
                  )
                : undefined
              await client.query(
                `INSERT INTO solution_step(
                   solution_id,step_order,step_title,step_text,step_role,
                   knowledge_point_id,method_id,formula_text
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                  insertedSolution.rows[0]!.id,
                  step.order,
                  step.title ?? null,
                  step.text,
                  step.role,
                  kp?.rows[0]?.id ?? null,
                  method?.rows[0]?.id ?? null,
                  step.formula_text ?? null
                ]
              )
            }
          }
        }
        if (c.knowledge_points) {
          await client.query(
            "DELETE FROM question_knowledge_point WHERE question_id=$1",
            [questionId]
          )
          for (const label of c.knowledge_points) {
            await client.query(
              `INSERT INTO question_knowledge_point(
                 question_id,knowledge_point_id,role,confidence
               ) VALUES ($1,$2,$3,$4)`,
              [questionId, label.id, label.role, label.confidence]
            )
          }
        }
        if (c.methods) {
          await client.query("DELETE FROM question_method WHERE question_id=$1", [questionId])
          for (const label of c.methods) {
            await client.query(
              `INSERT INTO question_method(question_id,method_id,role,confidence)
               VALUES ($1,$2,$3,$4)`,
              [questionId, label.id, label.role, label.confidence]
            )
          }
        }
      }
      const reviewStatus =
        decision.decision === "approve" ? "approved" :
        decision.decision === "reject" ? "rejected" : "needs_fix"
      await client.query(
        `UPDATE asset_review_log SET review_status=$2,reviewer=$3,review_note=$4,
           created_at=now() WHERE id=$1`,
        [reviewItemId, reviewStatus, decision.reviewer, `${decision.review_note}\nrequest:${requestId}`]
      )
      let questionStatus = review.rows[0]!.question_status
      if (reviewStatus === "approved") {
        await client.query("UPDATE solution_asset SET status='active' WHERE question_id=$1 AND is_primary", [questionId])
        await client.query("UPDATE question_asset SET status='active' WHERE id=$1", [questionId])
        questionStatus = "active"
      } else if (reviewStatus === "rejected") {
        await client.query("UPDATE question_asset SET status='rejected' WHERE id=$1", [questionId])
        questionStatus = "rejected"
      }
      return {
        reviewItemId,
        questionId,
        reviewStatus,
        questionStatus: questionStatus as ReviewApplyResult["questionStatus"]
      }
    })
  }
}
