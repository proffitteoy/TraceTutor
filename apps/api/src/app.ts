import cors from "@fastify/cors"
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify"
import { timingSafeEqual } from "node:crypto"
import { ZodError, type ZodType } from "zod"
import type { LocalAgentRuntime } from "./agent/local-agent.js"
import type { AppConfig } from "./config.js"
import {
  learningRequestSchema,
  queryPlanSchema,
  stateDeltaSchema,
  toolResultSchema
} from "./contracts.js"
import { AppError } from "./errors.js"
import type { ToolExecutionPort } from "./ports.js"
import { toolInputSchemas, toolRoutes } from "./tool-schemas.js"

export interface AppDependencies {
  config: AppConfig
  agentRuntime?: LocalAgentRuntime
  toolExecution?: ToolExecutionPort
}

function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new AppError(
      "INVALID_REQUEST",
      "请求不符合接口契约",
      400,
      parsed.error.flatten()
    )
  }
  return parsed.data
}

function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false
  const supplied = authorization.slice("Bearer ".length)
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expectedToken)

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
}

async function requireToolAuthentication(
  request: FastifyRequest,
  config: AppConfig
): Promise<void> {
  if (config.toolToken === undefined) {
    if (config.nodeEnv === "production") {
      throw new AppError(
        "DEPENDENCY_UNAVAILABLE",
        "工具网关鉴权尚未配置",
        503
      )
    }
    return
  }

  if (!hasValidBearerToken(request.headers.authorization, config.toolToken)) {
    throw new AppError("INVALID_REQUEST", "工具网关鉴权失败", 401)
  }
}

function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies
): void {
  app.get("/health/live", async () => ({
    status: "ok",
    service: "tracetutor-api"
  }))

  app.get("/health/ready", async (_request, reply) => {
    const modelHealth = dependencies.agentRuntime
      ? await dependencies.agentRuntime.modelHealth()
      : { ready: false, detail: "本地 Agent Runtime 未装配" }
    const dependencyStatus = {
      local_agent_runtime: dependencies.agentRuntime ? "ready" : "unconfigured",
      model_api: modelHealth.ready ? "ready" : modelHealth.detail,
      tool_execution: dependencies.toolExecution ? "ready" : "unconfigured",
      tool_auth:
        dependencies.config.toolToken !== undefined
          ? "ready"
          : dependencies.config.nodeEnv === "production"
            ? "required"
            : "development-open"
    }
    const ready =
      dependencies.agentRuntime !== undefined &&
      modelHealth.ready &&
      dependencies.toolExecution !== undefined

    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "degraded",
      dependencies: dependencyStatus
    })
  })
}

function registerAgentRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies
): void {
  app.post("/agent/chat", async request => {
    if (!dependencies.agentRuntime) {
      throw new AppError(
        "DEPENDENCY_UNAVAILABLE",
        "本地 Agent Runtime 尚未装配",
        503
      )
    }
    const payload = parseWith(learningRequestSchema, request.body)
    return dependencies.agentRuntime.run(payload, { requestId: request.id })
  })
}

function registerValidationRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies
): void {
  app.post("/internal/query-plans/validate", async request => {
    await requireToolAuthentication(request, dependencies.config)
    const plan = parseWith(queryPlanSchema, request.body)
    return { valid: true, plan }
  })

  app.post("/internal/state-deltas/validate", async request => {
    await requireToolAuthentication(request, dependencies.config)
    const stateDelta = parseWith(stateDeltaSchema, request.body)
    return {
      valid: true,
      state_delta: stateDelta,
      disposition: "pending"
    }
  })
}

function registerToolRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies
): void {
  for (const route of toolRoutes) {
    app.post(route.path, async request => {
      await requireToolAuthentication(request, dependencies.config)

      if (dependencies.toolExecution === undefined) {
        throw new AppError(
          "DEPENDENCY_UNAVAILABLE",
          "数据库业务工具端口尚未接入",
          503,
          { tool: route.name }
        )
      }

      if (!dependencies.toolExecution.capabilities.has(route.name)) {
        throw new AppError(
          "DEPENDENCY_UNAVAILABLE",
          `业务工具尚未实现：${route.name}`,
          503
        )
      }

      const input = parseWith(toolInputSchemas[route.name], request.body)
      const context = {
        requestId: request.id,
        userId: input.user_id,
        sessionId: input.session_id
      }

      let rawResult: unknown
      try {
        rawResult = await dependencies.toolExecution.execute(
          route.name,
          input,
          context
        )
      } catch (error) {
        if (error instanceof AppError) throw error
        throw new AppError(
          "TOOL_EXECUTION_ERROR",
          `业务工具执行失败：${route.name}`,
          502,
          error instanceof Error ? error.message : undefined
        )
      }

      const result = toolResultSchema.safeParse(rawResult)
      if (!result.success) {
        throw new AppError(
          "INVALID_TOOL_RESULT",
          `业务工具返回不符合契约：${route.name}`,
          502,
          result.error.flatten()
        )
      }

      return result.data
    })
  }
}

function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "接口不存在"
      }
    })
  })

  app.setErrorHandler(
    (
      error: Error,
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      if (error instanceof AppError) {
        void reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            request_id: request.id,
            ...(error.details === undefined ? {} : { details: error.details })
          }
        })
        return
      }

      if (error instanceof ZodError) {
        void reply.code(400).send({
          error: {
            code: "INVALID_REQUEST",
            message: "请求不符合接口契约",
            request_id: request.id,
            details: error.flatten()
          }
        })
        return
      }

      request.log.error({ error }, "Unhandled API error")
      void reply.code(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "服务内部错误",
          request_id: request.id
        }
      })
    }
  )
}

export async function createApp(
  dependencies: AppDependencies
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      dependencies.config.logLevel === "silent"
        ? false
        : { level: dependencies.config.logLevel },
    requestIdHeader: "x-request-id"
  })

  await app.register(cors, {
    origin: dependencies.config.corsOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"]
  })

  registerHealthRoutes(app, dependencies)
  registerAgentRoutes(app, dependencies)
  registerValidationRoutes(app, dependencies)
  registerToolRoutes(app, dependencies)
  registerErrorHandler(app)

  return app
}
