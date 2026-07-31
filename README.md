# TraceTutor

TraceTutor 是一个面向数学学习场景的 Agent 驱动教学系统，目标是形成“题目—状态—召回—生成—复习”的持续学习闭环。

## 当前状态

当前已落地：

- `apps/iris`：可运行的 Next.js 学习终端，提供对话/卡片树画布与分支交互，只负责输入、浏览器端工作区状态和 Agent 结果渲染。
- `apps/api`：可运行的 Fastify 服务与本地 Agent Runtime，负责模型 API、Workflow、契约、工具白名单、状态证据校验和降级。
- `db/sqlite`：已合并可运行的 Python 状态服务、6 个迁移和 `ToolExecutionPort` 内部契约，保存用户学习事实、掌握状态、复习调度与运行日志。
- `db/pgsql`：已落地 7 个迁移、真实 PgSQL 适配器、8 个资产工具、题库摄取/审核事务和 66 道已批准初始化题输入。

SQLite 与 PgSQL 已通过组合端口接入 `apps/api`。只有两套数据库、模型 API 和全部 15 个工具同时就绪时，`GET /health/ready` 才返回 `200`；缺少任一真实依赖都会明确返回 `503`。

## 核心边界

- Iris 不直接访问数据库，也不推断掌握度。
- 本地 Agent Runtime 负责意图理解、Workflow、工具调度和教学输出，不直接写数据库。
- 模型通过 OpenAI-compatible API 接入，只负责结构化生成，不拥有工具权限。
- API 只暴露有限业务工具，不提供万能 SQL。
- Agent 只能提出 `state_delta`，正式状态变化必须引用真实作答或复习证据并经过规则层。
- PgSQL 只存稳定题目资产；SQLite 只存用户学习状态。
- 未审核题、导入题和 AI 生成题不得进入 active 正式召回池。

## 目录

```text
TraceTutor/
├── apps/
│   ├── api/             # Fastify API / Tool Gateway
│   └── iris/            # Next.js 前端
├── db/
│   ├── pgsql/           # 迁移、初始化题库与题目资产实现
│   └── sqlite/          # 迁移 + 用户状态内部服务
├── docs/                # 长期设计与协作约束
├── runtime/             # 本地运行期生成物
└── tests/               # 跨组件测试入口说明
```

## 快速开始

### 一键启动（Windows）

首次启动会在 `runtime/` 中初始化项目专用 PostgreSQL、创建 Python 虚拟环境、
执行两套数据库迁移、构建 API 与 Iris，并在空题库中导入 66 道已批准题目：

```powershell
.\start-local.cmd
```

启动成功后访问 `http://127.0.0.1:3000`。停止全部项目服务：

```powershell
.\stop-local.cmd
```

模型配置保存在 Git 忽略的 `apps/api/.env`；Iris 只持有公开 API 地址。
运行日志和项目专用 PostgreSQL 数据均位于 Git 忽略的 `runtime/`。

### API

```powershell
Set-Location apps/api
npm install
Copy-Item .env.example .env
npm run type-check
npm test
npm run dev
```

默认地址为 `http://127.0.0.1:4100`。环境变量和数据库接入点见 [apps/api/README.md](./apps/api/README.md)。

### SQLite 用户状态服务

```powershell
Set-Location db/sqlite/state-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
tracetutor-state migrate
uvicorn tracetutor_state.main:app --app-dir src --host 127.0.0.1 --port 8000
```

再在 `apps/api/.env` 配置同一个内部服务地址和 Token。完整说明见 [db/sqlite/README.md](./db/sqlite/README.md)。

### Iris

```powershell
Set-Location apps/iris
npm install
Copy-Item .env.example .env.local
npm run type-check
npm run dev
```

默认地址为 `http://localhost:3000`。前端只需要公开的 API 地址，详见 [apps/iris/README.md](./apps/iris/README.md)。

## 文档入口

- [docs/架构设计.md](./docs/架构设计.md)：系统整体边界与主流程
- [docs/接口与闭环设计.md](./docs/接口与闭环设计.md)：跨组件接口、状态写回与端到端闭环
- [docs/agent设计.md](./docs/agent设计.md)：主 Agent、子 Agent、Workflow、Prompt、工具约束
- [docs/pgsql设计.md](./docs/pgsql设计.md)：题目资产库设计
- [docs/题库摄取与审核.md](./docs/题库摄取与审核.md)：初始化 JSONL、用户题沉淀、AI 标注与人工复核
- [docs/SQLite设计.md](./docs/SQLite设计.md)：学习状态库设计
- [docs/数据库协作边界.md](./docs/数据库协作边界.md)：数据库、API 与 Iris 的并行协作边界

## 当前尚未完成

- 在目标 PostgreSQL 上执行迁移并导入 66 道已批准初始化题。
- 携带目标 PostgreSQL、SQLite、模型 API 和 Iris 的联合端到端验收。
- CI/CD 与生产部署脚本。

模型 API 通过 `MODEL_API_BASE_URL`、`MODEL_API_KEY` 和 `MODEL_NAME` 配置。当前验证覆盖隔离 PostgreSQL 迁移/约束、SQLite 状态服务与 API 适配契约，但不能替代目标部署联合端到端验证。
