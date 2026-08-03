import { afterEach, describe, expect, it } from "vitest"
import { PgSQLAssetAdapter } from "../src/adapters/pgsql.js"

const adapters: PgSQLAssetAdapter[] = []

afterEach(async () => {
  await Promise.all(adapters.splice(0).map(adapter => adapter.close()))
})

describe("PgSQLAssetAdapter", () => {
  it("监听空闲连接错误，避免 PostgreSQL 重启导致 API 进程退出", () => {
    const adapter = new PgSQLAssetAdapter(
      "postgresql://tracetutor_app@127.0.0.1:55432/tracetutor"
    )
    adapters.push(adapter)

    expect(adapter.pool.listenerCount("error")).toBeGreaterThan(0)
  })
})
