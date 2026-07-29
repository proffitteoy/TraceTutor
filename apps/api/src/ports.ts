import type { ToolName, ToolResult } from "./contracts.js"

export interface RequestContext {
  requestId: string
  userId: string
  sessionId: string
}

/**
 * 数据库协作者只需实现这个业务工具端口。
 * API 不共享连接对象、ORM model、SQL 字符串或表级 repository。
 */
export interface ToolExecutionPort {
  readonly capabilities: ReadonlySet<ToolName>
  execute(
    tool: ToolName,
    input: Readonly<Record<string, unknown>>,
    context: RequestContext
  ): Promise<ToolResult>
}
