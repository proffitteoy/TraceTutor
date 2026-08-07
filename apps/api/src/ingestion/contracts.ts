import { createHash } from "node:crypto"
import { z } from "zod"

export const questionTypes = [
  "single_choice",
  "multiple_choice",
  "fill_blank",
  "calculation",
  "proof",
  "programming",
  "essay"
] as const

export const stepRoles = [
  "understand_problem",
  "transform",
  "apply_method",
  "compute",
  "conclude",
  "check"
] as const

const sourceSchema = z
  .object({
    type: z.enum([
      "manual",
      "textbook",
      "exam",
      "pdf",
      "markdown",
      "ai_generated",
      "user_submitted",
      "external_import"
    ]),
    title: z.string().trim().min(1).max(500),
    reference: z.string().trim().min(1).max(1_000).optional(),
    license_note: z.string().trim().min(1).max(2_000).optional()
  })
  .strict()

const subjectSchema = z
  .object({
    code: z.string().trim().min(1).max(128),
    chapter_code: z.string().trim().min(1).max(128).optional()
  })
  .strict()

const answerSchema = z
  .object({
    answer_type: z.enum(["standard", "short", "option", "numeric", "symbolic"]),
    answer_text: z.string().trim().min(1).max(20_000),
    is_primary: z.boolean().default(false)
  })
  .strict()

const solutionStepSchema = z
  .object({
    order: z.number().int().min(1).max(200),
    role: z.enum(stepRoles),
    title: z.string().trim().min(1).max(500).optional(),
    text: z.string().trim().min(1).max(20_000),
    formula_text: z.string().trim().min(1).max(10_000).optional(),
    knowledge_point_code: z.string().trim().min(1).max(128).optional(),
    method_code: z.string().trim().min(1).max(128).optional()
  })
  .strict()

const solutionSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    solution_type: z.enum([
      "standard",
      "alternative",
      "concise",
      "detailed",
      "teaching",
      "review"
    ]),
    text: z.string().trim().min(1).max(40_000).optional(),
    main_method_code: z.string().trim().min(1).max(128).optional(),
    is_primary: z.boolean().default(false),
    steps: z.array(solutionStepSchema).max(200).default([])
  })
  .strict()
  .refine(
    solution => solution.text !== undefined || solution.steps.length > 0,
    "解析必须包含 text 或至少一个 step"
  )
  .refine(
    solution =>
      new Set(solution.steps.map(step => step.order)).size ===
      solution.steps.length,
    "同一解析内的 step.order 不得重复"
  )

const knowledgeLabelSchema = z
  .object({
    code: z.string().trim().min(1).max(128),
    role: z.enum(["primary", "secondary", "prerequisite", "hidden"]),
    confidence: z.number().min(0).max(1)
  })
  .strict()

const methodLabelSchema = z
  .object({
    code: z.string().trim().min(1).max(128),
    role: z.enum(["primary", "secondary", "alternative", "hidden"]),
    confidence: z.number().min(0).max(1)
  })
  .strict()

export const questionJsonlSchema = z
  .object({
    schema_version: z.literal("1.0"),
    external_id: z.string().trim().min(1).max(256),
    source: sourceSchema,
    subject: subjectSchema,
    title: z.string().trim().min(1).max(1_000),
    stem: z.string().trim().min(1).max(20_000),
    question_type: z.enum(questionTypes),
    difficulty_level: z.number().int().min(1).max(5),
    answers: z.array(answerSchema).min(1).max(20),
    solutions: z.array(solutionSchema).min(1).max(20),
    knowledge_points: z.array(knowledgeLabelSchema).min(1).max(50),
    methods: z.array(methodLabelSchema).min(1).max(50),
    status: z.literal("imported").default("imported"),
    metadata: z
      .object({
        language: z.string().trim().min(1).max(32).default("zh"),
        estimated_time_minutes: z.number().int().min(1).max(1_440).optional(),
        has_image: z.boolean().default(false),
        attachment_refs: z
          .array(z.string().trim().min(1).max(1_000))
          .max(20)
          .default([]),
        structure_codes: z
          .array(z.string().trim().min(1).max(128))
          .max(50)
          .default([]),
        curation_confidence: z.number().min(0).max(1).optional(),
        ocr_quality: z
          .enum(["good", "reconstructed", "ambiguous", "unusable"])
          .optional(),
        ocr_note: z.string().trim().min(1).max(2_000).optional()
      })
      .strict()
      .default({
        language: "zh",
        has_image: false,
        attachment_refs: [],
        structure_codes: []
      })
  })
  .strict()
  .refine(
    question => question.answers.filter(answer => answer.is_primary).length === 1,
    {
      message: "每道题必须且只能有一个主答案",
      path: ["answers"]
    }
  )
  .refine(
    question =>
      question.solutions.filter(solution => solution.is_primary).length === 1,
    {
      message: "每道题必须且只能有一个主解析",
      path: ["solutions"]
    }
  )

export const tagDictionarySchema = z
  .object({
    knowledge_points: z.array(
      z
        .object({
          id: z.uuid(),
          code: z.string().trim().min(1).max(128),
          name: z.string().trim().min(1).max(500),
          subject_code: z.string().trim().min(1).max(128)
        })
        .strict()
    ),
    methods: z.array(
      z
        .object({
          id: z.uuid(),
          code: z.string().trim().min(1).max(128),
          name: z.string().trim().min(1).max(500)
        })
        .strict()
    )
  })
  .strict()

export const aiTagProposalSchema = z
  .object({
    knowledge_points: z.array(knowledgeLabelSchema).max(20),
    methods: z.array(methodLabelSchema).max(20),
    estimated_time_minutes: z.number().int().min(1).max(1_440),
    structure_codes: z
      .array(z.string().trim().min(1).max(128))
      .max(20),
    formula_warnings: z.array(z.string().trim().min(1).max(1_000)).max(20),
    review_notes: z.array(z.string().trim().min(1).max(1_000)).max(20)
  })
  .strict()

export const userQuestionNormalizationSchema = z
  .object({
    subject: subjectSchema,
    title: z.string().trim().min(1).max(1_000),
    stem: z.string().trim().min(1).max(20_000),
    question_type: z.enum(questionTypes),
    difficulty_level: z.number().int().min(1).max(5),
    answers: z.array(answerSchema).min(1).max(10),
    solutions: z.array(solutionSchema).min(1).max(10),
    knowledge_points: z.array(knowledgeLabelSchema).max(20),
    methods: z.array(methodLabelSchema).max(20),
    estimated_time_minutes: z.number().int().min(1).max(1_440),
    structure_codes: z
      .array(z.string().trim().min(1).max(128))
      .max(20),
    review_notes: z.array(z.string().trim().min(1).max(1_000)).max(20)
  })
  .strict()
  .refine(
    question => question.answers.filter(answer => answer.is_primary).length === 1,
    {
      message: "沉淀题必须且只能有一个主答案",
      path: ["answers"]
    }
  )
  .refine(
    question =>
      question.solutions.filter(solution => solution.is_primary).length === 1,
    {
      message: "沉淀题必须且只能有一个主解析",
      path: ["solutions"]
    }
  )

export const importChunkRequestSchema = z
  .object({
    batch_key: z.string().trim().min(1).max(256),
    batch_name: z.string().trim().min(1).max(500),
    source_type: z.enum(["jsonl", "manual"]),
    source_uri: z.string().trim().min(1).max(2_000).optional(),
    approval_mode: z.enum(["review", "activate"]).default("review"),
    approval_source: z.string().trim().min(1).max(256).optional(),
    final_chunk: z.boolean().default(false),
    items: z
      .array(
        z
          .object({
            line_number: z.number().int().min(1),
            raw_text: z.string().max(200_000),
            raw_json: z.unknown().optional()
          })
          .strict()
      )
      .min(1)
      .max(50)
  })
  .strict()

const correctedLabelSchema = z
  .object({
    id: z.uuid(),
    role: z.string().trim().min(1).max(64),
    confidence: z.number().min(0).max(1).default(1)
  })
  .strict()

export const reviewDecisionSchema = z
  .object({
    reviewer: z.string().trim().min(1).max(256),
    decision: z.enum(["approve", "reject", "needs_fix"]),
    review_note: z.string().trim().min(1).max(4_000),
    corrections: z
      .object({
        title: z.string().trim().min(1).max(1_000).optional(),
        stem: z.string().trim().min(1).max(20_000).optional(),
        question_type: z.enum(questionTypes).optional(),
        difficulty_level: z.number().int().min(1).max(5).optional(),
        answers: z.array(answerSchema).min(1).max(20).optional(),
        solutions: z.array(solutionSchema).min(1).max(20).optional(),
        knowledge_points: z.array(correctedLabelSchema).min(1).max(50).optional(),
        methods: z.array(correctedLabelSchema).min(1).max(50).optional()
      })
      .strict()
      .optional()
  })
  .strict()

export interface ResolvedLabel {
  id: string
  code: string
  role: string
  confidence: number
  source: "provided" | "ai"
}

export interface PersistableQuestion {
  schemaVersion: "1.0"
  externalId: string
  source: z.infer<typeof sourceSchema>
  subject: z.infer<typeof subjectSchema>
  title: string
  stem: string
  questionType: (typeof questionTypes)[number]
  difficultyLevel: number
  answers: Array<z.infer<typeof answerSchema>>
  solutions: Array<z.infer<typeof solutionSchema>>
  knowledgePoints: ResolvedLabel[]
  methods: ResolvedLabel[]
  unresolvedKnowledgeCodes: string[]
  unresolvedMethodCodes: string[]
  canonicalHash: string
  status: "imported" | "draft" | "active"
  metadata: Record<string, unknown>
  reviewNotes: string[]
}

export interface ImportChunkSummary {
  batchId: string
  received: number
  imported: number
  duplicates: number
  failed: number
  finalChunk: boolean
}

export interface QuestionDepositReport {
  status: "active_created" | "duplicate" | "failed"
  reason: string
  questionId?: string
  reviewItemId?: string
}

export function normalizeStemForHash(stem: string): string {
  return stem
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("zh-CN")
}

export function canonicalQuestionHash(stem: string): string {
  return createHash("sha256")
    .update(normalizeStemForHash(stem), "utf8")
    .digest("hex")
}

export type QuestionJsonl = z.infer<typeof questionJsonlSchema>
export type TagDictionary = z.infer<typeof tagDictionarySchema>
export type AiTagProposal = z.infer<typeof aiTagProposalSchema>
export type UserQuestionNormalization = z.infer<
  typeof userQuestionNormalizationSchema
>
export type ImportChunkRequest = z.input<typeof importChunkRequestSchema>
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>
