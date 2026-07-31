# 跨模块联调边界

## apps/api

`apps/api` 负责：

- Iris 的公开 HTTP 契约；
- 本地 Agent Runtime、模型调用和 Workflow；
- 15 个业务工具的白名单、输入校验和结果校验；
- 组合 PgSQL 与 SQLite 工具能力；
- 总体存活、就绪和降级状态。

SQLite 状态服务只接受 `apps/api` 的内部请求。它不应被 Iris 或模型直接访问。

## PgSQL 题目资产服务

PgSQL 负责稳定题目、答案、解析、知识点、方法、相似关系、来源和质量状态，并提供 8 个 `asset.*` 能力。未审核题不得进入 active 召回。

SQLite 可按配置校验外部资产引用：

```text
off    仅用于不接资产库的本地开发
format 检查标识格式
http   调用资产服务校验引用
```

最小引用校验合同：

```http
POST /validate-reference
Authorization: Bearer <optional-token>
Content-Type: application/json

{
  "reference_type": "question",
  "reference_id": "Q1"
}
```

## Iris

Iris 只调用 `apps/api`，负责用户输入、会话身份、卡片渲染和动作提交。它不读取 `.db`，不调用 SQLite 内部接口，也不推断掌握状态。

## 模型 API

模型通过 OpenAI-compatible API 接入 `apps/api`。模型只生成结构化计划、判题建议和教学内容，不拥有数据库凭据或工具权限。

## 当前联调状态

- SQLite 的 7 个状态/日志工具已实现并接入 `apps/api`。
- PgSQL 的 8 个资产工具尚未实现。
- 因此 SQLite 可独立 ready，但 TraceTutor 总体 readiness 必须保持 partial/503，直到全部工具能力齐全。

