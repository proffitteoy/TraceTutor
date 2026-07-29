import "dotenv/config"
import { LocalAgentRuntime } from "./agent/local-agent.js"
import { OpenAICompatibleModel } from "./agent/local-model.js"
import { createApp, type AppDependencies } from "./app.js"
import { loadConfig } from "./config.js"

const config = loadConfig()
const model = new OpenAICompatibleModel(
  config.modelApiBaseUrl,
  config.modelName,
  config.modelApiKey,
  config.modelTimeoutMs,
  config.modelResponseFormat
)
const agentRuntime = new LocalAgentRuntime(model)

const dependencies: AppDependencies = {
  config,
  agentRuntime
}

const app = await createApp(dependencies)

const close = async (signal: string) => {
  app.log.info({ signal }, "Stopping TraceTutor API")
  await app.close()
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
