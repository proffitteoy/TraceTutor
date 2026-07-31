import { z } from "zod"

const optionalSecret = (minimumLength: number) =>
  z.preprocess(
    value =>
      typeof value === "string" && value.trim() === ""
        ? undefined
        : value,
    z.string().min(minimumLength).optional()
  )

const optionalUrl = z.preprocess(
  value =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.url().optional()
)

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  MODEL_API_BASE_URL: z.url().default("http://127.0.0.1:11434/v1"),
  MODEL_API_KEY: optionalSecret(1),
  MODEL_NAME: z.string().min(1).default("qwen3:4b"),
  MODEL_RESPONSE_FORMAT: z
    .enum(["json_schema", "json_object"])
    .default("json_schema"),
  MODEL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(120_000),
  TRACE_TUTOR_SQLITE_SERVICE_URL: optionalUrl,
  TRACE_TUTOR_SQLITE_SERVICE_TOKEN: optionalSecret(16),
  TRACE_TUTOR_SQLITE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(5_000),
  TRACE_TUTOR_PGSQL_URL: optionalSecret(1),
  TRACE_TUTOR_PGSQL_MAX_CONNECTIONS: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10),
  TRACE_TUTOR_PGSQL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(5_000),
  TRACE_TUTOR_TOOL_TOKEN: optionalSecret(16)
}).superRefine((config, context) => {
  if (
    config.NODE_ENV === "production" &&
    config.TRACE_TUTOR_TOOL_TOKEN === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["TRACE_TUTOR_TOOL_TOKEN"],
      message: "production 环境必须配置 TRACE_TUTOR_TOOL_TOKEN"
    })
  }
  if (
    config.NODE_ENV === "production" &&
    config.TRACE_TUTOR_SQLITE_SERVICE_URL !== undefined &&
    config.TRACE_TUTOR_SQLITE_SERVICE_TOKEN === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["TRACE_TUTOR_SQLITE_SERVICE_TOKEN"],
      message:
        "production 环境配置 SQLite 服务地址时必须同时配置内部 service token"
    })
  }
})

export interface AppConfig {
  nodeEnv: "development" | "test" | "production"
  host: string
  port: number
  logLevel: string
  corsOrigins: string[]
  modelApiBaseUrl: string
  modelApiKey?: string
  modelName: string
  modelResponseFormat: "json_schema" | "json_object"
  modelTimeoutMs: number
  sqliteServiceUrl?: string
  sqliteServiceToken?: string
  sqliteTimeoutMs: number
  pgsqlUrl?: string
  pgsqlMaxConnections?: number
  pgsqlTimeoutMs?: number
  toolToken?: string
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  const parsed = configSchema.parse(environment)
  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map(origin => origin.trim())
    .filter(Boolean)

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    corsOrigins,
    modelApiBaseUrl: parsed.MODEL_API_BASE_URL.replace(/\/$/, ""),
    ...(parsed.MODEL_API_KEY
      ? { modelApiKey: parsed.MODEL_API_KEY }
      : {}),
    modelName: parsed.MODEL_NAME,
    modelResponseFormat: parsed.MODEL_RESPONSE_FORMAT,
    modelTimeoutMs: parsed.MODEL_TIMEOUT_MS,
    ...(parsed.TRACE_TUTOR_SQLITE_SERVICE_URL
      ? {
          sqliteServiceUrl: parsed.TRACE_TUTOR_SQLITE_SERVICE_URL.replace(
            /\/$/,
            ""
          )
        }
      : {}),
    ...(parsed.TRACE_TUTOR_SQLITE_SERVICE_TOKEN
      ? { sqliteServiceToken: parsed.TRACE_TUTOR_SQLITE_SERVICE_TOKEN }
      : {}),
    sqliteTimeoutMs: parsed.TRACE_TUTOR_SQLITE_TIMEOUT_MS,
    ...(parsed.TRACE_TUTOR_PGSQL_URL
      ? { pgsqlUrl: parsed.TRACE_TUTOR_PGSQL_URL }
      : {}),
    pgsqlMaxConnections: parsed.TRACE_TUTOR_PGSQL_MAX_CONNECTIONS,
    pgsqlTimeoutMs: parsed.TRACE_TUTOR_PGSQL_TIMEOUT_MS,
    ...(parsed.TRACE_TUTOR_TOOL_TOKEN
      ? { toolToken: parsed.TRACE_TUTOR_TOOL_TOKEN }
      : {})
  }
}
