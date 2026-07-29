# TraceTutor

TraceTutor 是一个面向数学学习场景的 Agent 驱动教学系统，目标是形成“题目—状态—召回—生成—复习”的持续学习闭环。

## 当前状态

非数据库架构已经落地：

- `apps/iris`：可运行的 Next.js 学习终端，只负责输入与渲染。
- `apps/api`：可运行的 Fastify 服务与本地 Agent Runtime，负责模型 API、Workflow、契约、工具白名单、状态证据校验和降级。
- `db/pgsql`、`db/sqlite`：仍由数据库协作者交付；当前 API 已预留 `ToolExecutionPort`，不会用假数据代替。

因此现在可以独立验证前端、API 和本地 Agent，但数据库工具接入前，`GET /health/ready` 会正确返回降级状态，不能宣称数据闭环已完成。

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
│   ├── pgsql/           # 数据库协作者范围
│   └── sqlite/          # 数据库协作者范围
├── docs/                # 长期设计与协作约束
├── runtime/             # 本地运行期生成物
└── tests/               # 跨组件测试入口说明
```

## 快速开始

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
- [docs/SQLite设计.md](./docs/SQLite设计.md)：学习状态库设计
- [docs/数据库协作边界.md](./docs/数据库协作边界.md)：数据库、API 与 Iris 的并行协作边界

## 当前尚未完成

- PgSQL / SQLite 的真实迁移、查询与写回实现。
- `ToolExecutionPort` 与两套数据库实现的装配。
- 携带真实数据库和真实 Agent 的端到端联调。
- CI/CD 与生产部署脚本。

模型 API 通过 `MODEL_API_BASE_URL`、`MODEL_API_KEY` 和 `MODEL_NAME` 配置。数据库缺口完成前，本仓库的构建和契约测试只能证明非数据库链路自身可用，不能替代真实数据端到端验证。
