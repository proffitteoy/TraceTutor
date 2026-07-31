# SQLite 用户状态库

`db/sqlite` 是 TraceTutor 的用户学习状态边界，只保存用户事实、派生状态、复习调度和运行日志，不保存完整题目、答案或解析。

## 目录

```text
db/sqlite/
├── migrations/       # TraceTutor 规范迁移，当前版本 6
└── state-service/    # Python/FastAPI 内部状态服务
```

迁移在 `migrations/` 中维护；Python 包内的 `src/tracetutor_state/sql_migrations/` 是用于打包的同步副本，两处内容由发布检查核对。

## 调用边界

```text
Iris
  → apps/api + LocalAgentRuntime
  → ToolExecutionPort
  → POST /internal/tool-execution
  → SQLite 状态服务
  → SQLite 文件
```

- Iris、模型和 Agent Runtime 都不能直连 SQLite。
- `apps/api` 是唯一公开业务入口。
- 状态服务是本机或受控内网依赖，只接受 Bearer service token。
- 不提供 `execute_sql`；只接受 7 个固定状态/日志工具。
- 题目相关数据只保存 `question_id`、`knowledge_point_id`、`method_id` 等引用和必要历史标签快照。

## 本地启动

```powershell
Set-Location db/sqlite/state-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
tracetutor-state migrate
uvicorn tracetutor_state.main:app --app-dir src --host 127.0.0.1 --port 8000
```

开发环境可不配置 token；生产环境必须配置：

```dotenv
TRACE_TUTOR_SQLITE_PATH=data/tracetutor_state.db
TRACE_TUTOR_STATE_ENV=production
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<long-random-secret>
```

然后在 `apps/api/.env` 设置相同 token 和 `TRACE_TUTOR_SQLITE_SERVICE_URL=http://127.0.0.1:8000`。

## 验证

在 `state-service` 目录执行：

```powershell
python -m compileall -q src tests scripts
python -m pytest -q
python scripts/verify_release.py
```

详细契约、部署和内部接入说明见 [state-service/README.md](./state-service/README.md)。
