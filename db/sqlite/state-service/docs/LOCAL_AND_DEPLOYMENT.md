# 本地运行与部署

SQLite 不是独立数据库服务器。需要运行的是本目录的 FastAPI 内部状态服务，数据库文件由该进程打开。

## 本地开发

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
tracetutor-state migrate
uvicorn tracetutor_state.main:app --app-dir src --host 127.0.0.1 --port 8000
```

默认数据库为 `data/tracetutor_state.db`。正式改表必须新增 migration，不能用数据库浏览器直接改 schema。

## 与 apps/api 联调

状态服务：

```dotenv
TRACE_TUTOR_STATE_ENV=development
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<shared-secret>
```

`apps/api`：

```dotenv
TRACE_TUTOR_SQLITE_SERVICE_URL=http://127.0.0.1:8000
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<shared-secret>
TRACE_TUTOR_SQLITE_TIMEOUT_MS=5000
```

两个服务应在同机或受控内网通信，不需要把 SQLite 服务暴露到公网。

## Docker

```bash
docker compose up --build -d
```

`./data` 挂载到容器持久化目录。不要把数据库只放在容器临时层，也不要让多个容器副本通过 NFS/SMB 同时写同一 `.db`。

## 生产约束

- `TRACE_TUTOR_STATE_ENV=production`；
- 必须提供不少于 16 字符的内部 service token；
- 只允许 `apps/api` 所在主机或网络访问；
- 单写实例；
- 持久化本地磁盘；
- 定期使用 SQLite backup API 或停机复制进行备份；
- `.db`、WAL、真实用户日志和凭据不得提交 Git。

## 健康检查

```bash
curl http://127.0.0.1:8000/health/live
curl http://127.0.0.1:8000/health/ready
```

ready 会检查迁移版本 6 和数据库一致性。TraceTutor 的总体状态应以 `apps/api` 的 `/health/ready` 为准。

## 何时迁移到 PostgreSQL

出现多写副本、高并发写、跨服务器共享状态、复杂多租户权限或高可用要求时，应评估迁移。迁移时保持 `ToolExecutionPort` 业务合同不变，替换内部持久化实现。

