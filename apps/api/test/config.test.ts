import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

describe("loadConfig", () => {
  it("允许直接复制 .env.example 后保留空的可选密钥", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      MODEL_API_KEY: "",
      TRACE_TUTOR_TOOL_TOKEN: ""
    })

    expect(config.modelApiKey).toBeUndefined()
    expect(config.toolToken).toBeUndefined()
  })

  it("生产环境要求工具路由 Bearer Token", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        TRACE_TUTOR_TOOL_TOKEN: ""
      })
    ).toThrow()
  })

  it("生产环境接入 SQLite 时要求内部 service token", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        TRACE_TUTOR_TOOL_TOKEN: "tool-token-long-enough",
        TRACE_TUTOR_SQLITE_SERVICE_URL: "http://127.0.0.1:8000",
        TRACE_TUTOR_SQLITE_SERVICE_TOKEN: ""
      })
    ).toThrow()
  })
})
