# TraceTutor API

`apps/api` 同时承载 HTTP API 与本地 Agent Runtime，是 Iris、模型 API 与两套数据库之间的唯一公开业务边界。数据库业务工具通过 `ToolExecutionPort` 注入；SQLite 表、迁移和 SQL 仍只位于 `db/sqlite`。

## 已实现能力

- `POST /agent/chat`：在本地执行 QueryPlan、工具调度、可选判题/写回与教学输出，并校验 `LearningResponse`。
- `POST /internal/query-plans/validate`：校验 Agent 查询计划、工具白名单、参数形态与 `limit <= 20`，拒绝 SQL 字段。
- `POST /internal/state-deltas/validate`：校验状态建议必须引用真实题目及 `attempt_id` / `review_event_id`，结果只进入 `pending`。
- 15 个静态 `/tools/*` 业务工具入口，覆盖读取、作答事实、pending delta 应用与日志。
- JSONL 初始化题库处理器、用户新题自动沉淀、AI 标签提议和人工复核 API；真实持久化由 `PgSQLAssetAdapter` 完成。
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

不连接 PgSQL 时，可以先按运行时契约校验 UTF-8 JSONL：

```powershell
npm run questions:validate -- `
  --file ..\..\db\pgsql\question-bank\approved-initial-batch-2026-07-30.jsonl
```

可以分片导入普通 UTF-8 JSONL：

```powershell
npm run questions:import -- `
  --file ..\..\db\pgsql\examples\higher-math-limit.sample.jsonl `
  --batch-name "高数极限首批题库"
```

格式、幂等键、AI 标注和人工复核规则见 [题库摄取与审核](../../docs/题库摄取与审核.md)。

已批准初始化批次使用 `--activate-approved-manifest`；命令会先校验 SHA-256
和全部 `external_id`，随后在写入真实审核证据的同一题目事务内直接激活。
完整命令见 [PgSQL README](../../db/pgsql/README.md)。

## 依赖状态

服务可以在数据库端口尚未接入时启动，便于验证契约，但不会伪造数据：

- `GET /health/live`：进程存活即返回 `200`。
- `GET /health/ready`：模型、SQLite 或任一白名单工具能力未就绪时返回 `503` 和逐项状态。
- `/tools/*`：数据库工具端口未接入或未声明能力时返回 `DEPENDENCY_UNAVAILABLE`。
- `/internal/question-ingestion/*`：PgSQL 摄取端口未接入时返回 `DEPENDENCY_UNAVAILABLE`。
- `/agent/chat`：模型 API 不可用时返回 `MODEL_UNAVAILABLE`，不会生成假答案。

模型通过 OpenAI-compatible Chat Completions API 接入：

```text
MODEL_API_BASE_URL
MODEL_API_KEY
MODEL_NAME
MODEL_RESPONSE_FORMAT
MODEL_TIMEOUT_MS
TRACE_TUTOR_SQLITE_SERVICE_URL
TRACE_TUTOR_SQLITE_SERVICE_TOKEN
TRACE_TUTOR_SQLITE_TIMEOUT_MS
TRACE_TUTOR_PGSQL_URL
TRACE_TUTOR_PGSQL_MAX_CONNECTIONS
TRACE_TUTOR_PGSQL_TIMEOUT_MS
```

Agent Runtime、Prompt、Workflow、工具调度和结果校验全部在本地 API 进程内完成。模型 API Key 只保存在 API 服务端，不能放入 Iris 的 `NEXT_PUBLIC_*` 变量。

## SQLite 内部服务接入

当前已实现 [src/adapters/sqlite-tool-execution.ts](./src/adapters/sqlite-tool-execution.ts)，通过内部 HTTP 调用 `db/sqlite/state-service`：

```dotenv
TRACE_TUTOR_SQLITE_SERVICE_URL=http://127.0.0.1:8000
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<与状态服务相同的长随机字符串>
TRACE_TUTOR_SQLITE_TIMEOUT_MS=5000
```

SQLite 适配器声明 7 个状态能力，PgSQL 适配器声明 8 个资产能力，
`CompositeToolExecutionPort` 将二者组合为完整的 15 工具边界。

## 数据库接入点

所有数据库实现都必须收敛到 [src/ports.ts](./src/ports.ts)：

- `ToolExecutionPort` 提供 15 个运行期业务工具；
- `QuestionIngestionPort` 提供批量导入、用户题 draft 和人工复核事务。

生产入口已按以下方式装配：

```ts
const questionIngestion = new QuestionIngestionService(
  model,
  questionIngestionPort
)
const agentRuntime = new LocalAgentRuntime(
  model,
  toolExecution,
  questionIngestion
)
const app = await createApp({
  config,
  agentRuntime,
  toolExecution,
  questionIngestion
})
```

接入约束：

- 只实现 `capabilities` 声明的白名单业务工具。
- 不向 Agent 暴露连接对象、ORM model、表级 repository 或 SQL 字符串。
- 每次执行必须使用 `RequestContext` 校验用户与会话归属。
- 返回结果必须符合 `ToolResult`，包含 `meta.source`、`meta.status` 和可解释的 `meta.reason`。
- 未审核题不得从正式检索工具返回；生成题只能经 `asset.create_draft_question` 进入草稿。
- 题目摄取写入必须事务性维护 staging、题目资产和审核记录；普通题审批前不能进入 `active`，经哈希与 external_id 对账的明确批准 manifest 可在写入 approved 证据后直接激活。

## 代码结构

```text
src/
├── adapters/          # 数据库业务工具端口适配器
├── agent/             # 本地 Agent Runtime、Prompt 与模型 API
├── cli/               # JSONL 初始化工具
├── ingestion/         # 题目 Schema、AI 标注与摄取编排
├── app.ts             # Fastify 装配、路由、鉴权与错误边界
├── config.ts          # 环境变量校验
├── contracts.ts       # 跨层运行时契约
├── ports.ts           # Agent 与数据库业务工具端口
├── server.ts          # 生产进程入口
└── tool-schemas.ts    # 15 个业务工具的输入 Schema 与路由
```

## 安全边界

- 没有 `execute_sql` 或任意查询接口。
- Agent 的 `state_delta` 不能直接写正式状态。
- API 不把数据库字段传播给 Iris。
- 工具结果不符合契约时按上游错误处理，不把不可信结果传给 Agent。
