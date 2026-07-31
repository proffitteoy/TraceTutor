import type { ToolName, ToolResult } from "../contracts.js"
import type {
  RequestContext,
  ToolExecutionHealth,
  ToolExecutionPort
} from "../ports.js"

export class CompositeToolExecutionPort implements ToolExecutionPort {
  readonly capabilities: ReadonlySet<ToolName>

  constructor(private readonly ports: readonly ToolExecutionPort[]) {
    this.capabilities = new Set(ports.flatMap(port => [...port.capabilities]))
  }

  async health(): Promise<ToolExecutionHealth> {
    const results = await Promise.all(
      this.ports.map(port =>
        port.health?.() ?? Promise.resolve({ ready: true, detail: "已装配" })
      )
    )
    return {
      ready: results.every(result => result.ready),
      detail: results.map(result => result.detail).join("；")
    }
  }

  execute(
    tool: ToolName,
    input: Readonly<Record<string, unknown>>,
    context: RequestContext
  ): Promise<ToolResult> {
    const port = this.ports.find(candidate => candidate.capabilities.has(tool))
    if (!port) throw new Error(`没有端口实现工具：${tool}`)
    return port.execute(tool, input, context)
  }
}
