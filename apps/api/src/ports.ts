import type { ToolName, ToolResult } from "./contracts.js"
import type {
  PersistableQuestion,
  QuestionDepositReport,
  ReviewDecision,
  TagDictionary
} from "./ingestion/contracts.js"

export interface RequestContext {
  requestId: string
  userId: string
  sessionId: string
}

export interface ToolExecutionHealth {
  ready: boolean
  detail: string
}

export interface PracticeQuestionSummary {
  questionId: string
  title: string
  stem: string
  questionType: string
  difficulty: number
  subjectCode: string
  subjectName: string
}

export interface PracticeQuestionCatalogPort {
  listPracticeQuestions(input: {
    limit: number
    subjectCode?: string
  }): Promise<PracticeQuestionSummary[]>
}

export interface QuestionAttemptHistoryItem {
  attemptId: string
  sessionId: string | null
  userAnswerText: string | null
  isCorrect: boolean | null
  score: number | null
  attemptStatus: "viewed" | "submitted" | "checked" | "abandoned" | "skipped"
  errorDetailText: string | null
  createdAt: string
  checkedAt: string | null
}

export interface QuestionHistoryPort {
  listQuestionAttempts(input: {
    userId: string
    questionId: string
    limit: number
  }): Promise<QuestionAttemptHistoryItem[]>
}

/**
 * 数据库协作者只需实现这个业务工具端口。
 * API 不共享连接对象、ORM model、SQL 字符串或表级 repository。
 */
export interface ToolExecutionPort {
  readonly capabilities: ReadonlySet<ToolName>
  health?(): Promise<ToolExecutionHealth>
  execute(
    tool: ToolName,
    input: Readonly<Record<string, unknown>>,
    context: RequestContext
  ): Promise<ToolResult>
}

export interface TaggingContextQuery {
  subjectCode?: string
  stem: string
  proposedKnowledgeCodes: string[]
  proposedMethodCodes: string[]
}

export interface ImportBatchStart {
  batchKey: string
  batchName: string
  sourceType: "jsonl" | "manual"
  sourceUri?: string
}

export interface ImportItemWrite {
  batchId: string
  lineNumber: number
  rawText: string
  rawJson?: unknown
  outcome: "imported" | "failed"
  question?: PersistableQuestion
  errorMessage?: string
  requestId: string
  activateApproved?: boolean
  approvalSource?: string
}

export interface ImportItemWriteResult {
  outcome: "imported" | "duplicate" | "failed"
  questionId?: string
  reviewItemId?: string
}

export interface UserQuestionDraftWrite {
  question: PersistableQuestion
  userId: string
  sessionId: string
  workflowRunId: string
  requestId: string
}

export interface ReviewQueueQuery {
  status: "pending" | "needs_fix"
  limit: number
  cursor?: string
}

export interface ReviewQueueItem {
  reviewItemId: string
  questionId: string
  status: "pending" | "needs_fix"
  originStatus: "imported" | "draft"
  question: PersistableQuestion
  createdAt: string
}

export interface ReviewQueuePage {
  items: ReviewQueueItem[]
  nextCursor?: string
}

export interface ReviewApplyResult {
  reviewItemId: string
  questionId: string
  reviewStatus: "approved" | "rejected" | "needs_fix"
  questionStatus: "active" | "rejected" | "imported" | "draft"
}

/**
 * PgSQL 协作者实现此高层端口即可接通批量导入、用户题沉淀和人工复核。
 * 每个写方法必须在单个数据库事务中同时维护 staging、题目资产和审核记录。
 */
export interface QuestionIngestionPort {
  health?(): Promise<ToolExecutionHealth>
  loadTaggingContext(query: TaggingContextQuery): Promise<TagDictionary>
  beginImportBatch(input: ImportBatchStart): Promise<{ batchId: string }>
  recordImportItem(input: ImportItemWrite): Promise<ImportItemWriteResult>
  finishImportBatch(batchId: string): Promise<void>
  writeUserQuestionDraft(
    input: UserQuestionDraftWrite
  ): Promise<QuestionDepositReport>
  listReviewQueue(query: ReviewQueueQuery): Promise<ReviewQueuePage>
  applyReview(
    reviewItemId: string,
    decision: ReviewDecision,
    requestId: string
  ): Promise<ReviewApplyResult>
}
