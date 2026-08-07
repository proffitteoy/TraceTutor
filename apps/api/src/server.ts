import "dotenv/config"
import { HttpSQLiteToolExecutionPort } from "./adapters/sqlite-tool-execution.js"
import { CompositeToolExecutionPort } from "./adapters/composite-tool-execution.js"
import { PgSQLAssetAdapter } from "./adapters/pgsql.js"
import { LocalAgentRuntime } from "./agent/local-agent.js"
import { OpenAICompatibleModel } from "./agent/local-model.js"
import { createApp, type AppDependencies } from "./app.js"
import { loadConfig } from "./config.js"
import { QuestionIngestionService } from "./ingestion/question-ingestion.js"

const config = loadConfig()
const model = new OpenAICompatibleModel(
  config.modelApiBaseUrl,
  config.modelName,
  config.modelApiKey,
  config.modelTimeoutMs,
  config.modelResponseFormat
)
const sqliteToolExecution = config.sqliteServiceUrl
  ? new HttpSQLiteToolExecutionPort(
      config.sqliteServiceUrl,
      config.sqliteServiceToken,
      config.sqliteTimeoutMs
    )
  : undefined
const pgsql = config.pgsqlUrl
  ? new PgSQLAssetAdapter(
      config.pgsqlUrl,
      config.pgsqlMaxConnections ?? 10,
      config.pgsqlTimeoutMs ?? 5_000
    )
  : undefined
const ports = [sqliteToolExecution, pgsql].filter(
  (port): port is NonNullable<typeof port> => port !== undefined
)
const toolExecution =
  ports.length > 0 ? new CompositeToolExecutionPort(ports) : undefined
const questionIngestion = pgsql
  ? new QuestionIngestionService(model, pgsql)
  : undefined
const agentRuntime = new LocalAgentRuntime(model, toolExecution, questionIngestion)

const dependencies: AppDependencies = {
  config,
  agentRuntime,
  ...(toolExecution ? { toolExecution } : {}),
  ...(sqliteToolExecution ? { sqliteToolExecution } : {}),
  ...(pgsql ? { pgsqlToolExecution: pgsql } : {}),
  ...(pgsql ? { questionCatalog: pgsql } : {}),
  ...(sqliteToolExecution ? { questionHistory: sqliteToolExecution } : {}),
  ...(questionIngestion ? { questionIngestion } : {})
}

const app = await createApp(dependencies)

const close = async (signal: string) => {
  app.log.info({ signal }, "Stopping TraceTutor API")
  await app.close()
  await pgsql?.close()
  process.exit(0)
}

process.once("SIGINT", () => {
  void close("SIGINT")
})
process.once("SIGTERM", () => {
  void close("SIGTERM")
})

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
