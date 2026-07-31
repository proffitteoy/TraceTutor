# 四份设计材料与本仓库边界映射

## 《SQLite设计》

完整逐节矩阵见 [`REQUIREMENTS_TRACEABILITY.md`](REQUIREMENTS_TRACEABILITY.md)。本仓库实现四层数据模型、全部表、索引、规则、API、bootstrap、pending evidence gate、复习、记忆、运行状态、事件和最终查询能力。

## 《pgsql设计》

| 设计要求 | 本仓库处理 |
|---|---|
| PgSQL 保存题目资产 | SQLite 不复制题干、答案、解析、相似网络和 embedding |
| 主键统一为 UUID | SQLite 用 TEXT 保存 UUID 字符串 |
| SQLite 只保存 question_id | `question_attempt.question_id` |
| 保存当时标签 | `question_attempt_tag` |
| 新题 draft/active 边界 | `source_type` + `docs/PGSQL_ID_CONTRACT.md` |
| API 层验证引用 | `asset_validator.py` 的 off/format/http 模式 |

## 《agent设计》

| 设计要求 | 本仓库处理 |
|---|---|
| 本地 Agent 负责调度、API 负责执行 | `apps/api` + 内部 ToolExecutionPort |
| 禁止裸 SQL | 71 个固定 operationId；7 个统一业务能力 |
| 状态建议不能直写 | 全类型 `pending_state_delta` evidence gate |
| 上下文压缩 | trigger 检测 + summary/memory/refs/runtime/bootstrap |
| Workflow 可观测 | workflow/tool/runtime/local event API |
| 查询计划与执行分开 | OpenAPI 工具合同，不接受 SQL |
| Iris 不碰数据库 | 只暴露 HTTP API |

## 《架构设计》

| 设计要求 | 本仓库处理 |
|---|---|
| 题目—状态—召回—生成—复习闭环 | 实现 SQLite 状态与复习两侧闭环 |
| 状态写回需真实证据 | attempt/review + tag/reference + range + workflow 校验 |
| 状态引擎与相似度引擎分开 | 本仓库只实现状态引擎；相似度属于 PgSQL |
| 会话题不自动污染正式题库 | `source_type` 和外部资产生命周期合同 |
| 早期 SQLite、后期迁移 | 单实例部署和 PostgreSQL 迁移说明 |

原始材料：

- `docs/reference/SQLite设计.pdf`：随仓库包含；
- 其他三份材料属于小组总设计，不复制进本 SQLite 子仓库，避免混入其他成员交付物。
