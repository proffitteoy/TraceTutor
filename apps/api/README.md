# TraceTutor API

`apps/api` 同时承载 HTTP API 与本地 Agent Runtime，是 Iris、模型 API 与两套数据库之间的安全边界。数据库业务工具通过 `ToolExecutionPort` 注入，本目录不包含 PgSQL 或 SQLite 的表、迁移和 SQL。

## 已实现能力

- `POST /agent/chat`：在本地执行 QueryPlan、工具调度、可选判题/写回与教学输出，并校验 `LearningResponse`。
- `POST /internal/query-plans/validate`：校验 Agent 查询计划、工具白名单、参数形态与 `limit <= 20`，拒绝 SQL 字段。
- `POST /internal/state-deltas/validate`：校验状态建议必须引用真实题目及 `attempt_id` / `review_event_id`，结果只进入 `pending`。
- 15 个静态 `/tools/*` 业务工具入口，覆盖读取、作答事实、pending delta 应用与日志。
- Bearer Token 工具鉴权；生产环境缺少 `TRACE_TUTOR_TOOL_TOKEN` 时拒绝启动。
- 结构化错误、请求 ID、CORS、存活与就绪探针。

## 本地运行

要求 Node.js 20 或兼容版本。在本目录执行：

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

默认监听 `http://127.0.0.1:4100`。可用命令：

```powershell
npm run type-check
npm test
npm run build
npm start
```

环境变量见 [.env.example](./.env.example)。

## 依赖状态

服务可以在数据库端口尚未接入时启动，便于验证契约，但不会伪造数据：

- `GET /health/live`：进程存活即返回 `200`。
- `GET /health/ready`：Agent 或数据库工具端口未接入时返回 `503` 和逐项状态。
- `/tools/*`：数据库工具端口未接入或未声明能力时返回 `DEPENDENCY_UNAVAILABLE`。
- `/agent/chat`：模型 API 不可用时返回 `MODEL_UNAVAILABLE`，不会生成假答案。

模型通过 OpenAI-compatible Chat Completions API 接入：

```text
MODEL_API_BASE_URL
MODEL_API_KEY
MODEL_NAME
MODEL_RESPONSE_FORMAT
MODEL_TIMEOUT_MS
```

Agent Runtime、Prompt、Workflow、工具调度和结果校验全部在本地 API 进程内完成。模型 API Key 只保存在 API 服务端，不能放入 Iris 的 `NEXT_PUBLIC_*` 变量。

## 数据库同事的接入点

实现 [src/ports.ts](./src/ports.ts) 中的 `ToolExecutionPort`，再在服务装配处传给 `createApp`：

```ts
const app = await createApp({
  config,
  agentGateway,
  toolExecution
})
```

接入约束：

- 只实现 `capabilities` 声明的白名单业务工具。
- 不向 Agent 暴露连接对象、ORM model、表级 repository 或 SQL 字符串。
- 每次执行必须使用 `RequestContext` 校验用户与会话归属。
- 返回结果必须符合 `ToolResult`，包含 `meta.source`、`meta.status` 和可解释的 `meta.reason`。
- 未审核题不得从正式检索工具返回；生成题只能经 `asset.create_draft_question` 进入草稿。

## 代码结构

```text
src/
├── agent/             # 本地 Agent Runtime、Prompt 与模型 API
├── app.ts             # Fastify 装配、路由、鉴权与错误边界
├── config.ts          # 环境变量校验
├── contracts.ts       # 跨层运行时契约
├── ports.ts           # Agent 与数据库业务工具端口
├── server.ts          # 生产进程入口
└── tool-schemas.ts    # 14 个业务工具的输入 Schema 与路由
```

## 安全边界

- 没有 `execute_sql` 或任意查询接口。
- Agent 的 `state_delta` 不能直接写正式状态。
- API 不把数据库字段传播给 Iris。
- 工具结果不符合契约时按上游错误处理，不把不可信结果传给 Agent。
