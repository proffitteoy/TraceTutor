# TraceTutor SQLite State Service

这是 TraceTutor 的内部用户学习状态服务。它由 `apps/api` 通过 `ToolExecutionPort` 调用，不是 Iris、模型或第三方 Agent 平台的公开网关。

## 系统位置

```text
Iris
  → apps/api + LocalAgentRuntime
  → HttpSQLiteToolExecutionPort
  → POST /internal/tool-execution
  → tracetutor_state
  → data/tracetutor_state.db
```

服务只负责 SQLite 用户状态边界：

- 学习会话、作答与复习事实；
- 掌握状态、错因和复习调度；
- pending state delta 的证据校验与确定性应用；
- 上下文摘要、运行状态、Workflow 和工具日志；
- 本地事件与迁移版本。

它不保存完整题目、答案或解析，不负责 PgSQL 题目召回，也不允许模型直接写数据库。

## 统一命名

- Python 包：`tracetutor_state`
- CLI：`tracetutor-state`
- 项目包：`tracetutor-sqlite-state-service`
- 默认数据库：`data/tracetutor_state.db`
- 环境变量前缀：`TRACE_TUTOR_`

## 内部工具契约

`POST /internal/tool-execution` 接受 `apps/api` 的统一工具请求：

```json
{
  "tool": "state.query_user_snapshot",
  "input": {
    "user_id": "U1",
    "session_id": "S1"
  },
  "context": {
    "request_id": "REQ1",
    "user_id": "U1",
    "session_id": "S1"
  }
}
```

当前实现 7 个能力：

```text
state.query_user_snapshot
state.query_wrong_questions
state.query_review_due_items
state.write_attempt_result
state.write_review_result
state.apply_state_delta
log.write_agent_event
```

`context` 与 `input` 的用户/会话作用域必须一致。写工具使用 `client_event_id` 保证幂等；正式状态只能由数据库生成并核验的 pending delta 应用。

服务还保留细粒度状态管理接口，用于本地维护、诊断和状态引擎测试。TraceTutor 的正常业务调用必须经过 `apps/api`，不能让 Iris 绕过 API 使用这些接口。

## 安装与启动

要求 Python 3.11 或更高版本。

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e "."
Copy-Item .env.example .env
tracetutor-state migrate
uvicorn tracetutor_state.main:app --app-dir src --host 127.0.0.1 --port 8000
```

Linux/macOS：

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e "."
cp .env.example .env
tracetutor-state migrate
uvicorn tracetutor_state.main:app --app-dir src --host 127.0.0.1 --port 8000
```

## 配置

```dotenv
TRACE_TUTOR_SQLITE_PATH=data/tracetutor_state.db
TRACE_TUTOR_STATE_ENV=development
TRACE_TUTOR_STATE_CORS_ORIGINS=http://127.0.0.1:4100
TRACE_TUTOR_STATE_LOG_LEVEL=INFO
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=
TRACE_TUTOR_SQLITE_MIGRATIONS_DIR=
TRACE_TUTOR_ASSET_VALIDATION_MODE=off
TRACE_TUTOR_ASSET_VALIDATION_URL=
TRACE_TUTOR_ASSET_VALIDATION_TOKEN=
TRACE_TUTOR_ASSET_VALIDATION_TIMEOUT_SECONDS=3
```

生产环境必须提供不少于 16 个字符的 `TRACE_TUTOR_SQLITE_SERVICE_TOKEN`。`apps/api` 使用同一个值作为 `TRACE_TUTOR_SQLITE_SERVICE_TOKEN`，并通过 `Authorization: Bearer <token>` 调用本服务。

## 健康检查

```http
GET /health/live
GET /health/ready
```

- `live` 只表示进程存活。
- `ready` 会检查数据库可访问、迁移版本为 6 且外键检查通过。

`apps/api` 会把这个结果纳入总 readiness；即使 SQLite ready，只要 PgSQL 工具未接入，总 readiness 仍应为 `503`。

## 迁移

规范迁移位于上级目录：

```text
db/sqlite/migrations/
```

打包副本位于：

```text
src/tracetutor_state/sql_migrations/
```

新增迁移时必须同时更新两处，且不得修改已经发布的旧迁移。`scripts/verify_release.py` 会检查两处文件完全一致。

## 验证

测试前安装开发依赖：

```powershell
python -m pip install -e ".[dev]"
```

```powershell
python -m compileall -q src tests scripts
python -m pytest -q
python scripts/verify_release.py
```

当前基线：

```text
25 tests passed
schema_version = 6
tables = 20
indexes = 31
triggers = 20
views = 5
OpenAPI paths = 65
OpenAPI operations = 71
foreign_key_violations = []
```

更多说明：

- [内部 ToolExecutionPort 接入](docs/TOOL_EXECUTION_PORT_INTEGRATION.md)
- [SQLite 子系统架构](docs/ARCHITECTURE.md)
- [本地运行与部署](docs/LOCAL_AND_DEPLOYMENT.md)
- [跨模块边界](docs/EXTERNAL_INTEGRATION_BOUNDARIES.md)
- [API 工具目录](docs/API_TOOLS.md)
