# 《SQLite设计》逐节实现追踪矩阵

本表对应 `docs/reference/SQLite设计.pdf` 的 30 个编号章节。状态“完成”表示该要求在 SQLite 服务职责内已有 schema、代码、API 和测试；“外部接口完成”表示 SQLite 适配器和合同已经实现，但真实题目资产、Agent 编排或前端数据由 PgSQL、`apps/api` 或 Iris 提供。

| PDF 章节 / 页码 | 要求摘要 | 实现位置 | 验证 | 状态 |
|---|---|---|---|---|
| 1. 职责边界，p1 | SQLite 存用户状态，不存完整题库；保存 PgSQL ID 引用 | `docs/SQLITE_BOUNDARY.md`、`question_attempt.question_id`、`question_attempt_tag.tag_id`、`asset_validator.py` | UUID/作用域测试 | 完成；PgSQL 实体由外部服务提供 |
| 2. 总体分层，p2 | 学习行为、学习状态、Agent 记忆、系统运行四层 | migration 001/002、`docs/ARCHITECTURE.md` | schema 表清单测试 | 完成 |
| 3. 建库配置，p3 | foreign_keys、WAL、NORMAL、busy_timeout、migration 表、预留 user_id | `db.py`、`migrations.py`、`schema_migration` | PRAGMA 与 migration 测试 | 完成 |
| 4. 用户与会话，p3–5 | `user_profile`、`learning_session`、`conversation_turn` | migration 001、state API CRUD | API 测试、跨用户触发器 | 完成 |
| 5. 做题记录，p5–6 | 事实表、答案、判题、错因、耗时、难度、自评 | `question_attempt`、create/check/list/get API | 作答主链路测试 | 完成 |
| 6. 标签快照，p7 | knowledge/method/type/structure/thinking pattern 快照、角色、权重、置信度 | `question_attempt_tag`、attach API、动态权重矩阵 | 标签快照、默认权重、ID 格式测试 | 完成 |
| 7. 掌握状态，p8–9 | 泛化实体表、mastery/confidence 分离、计数、标签和复习时间 | `mastery_state`、`state_rules.py` | 动态规则、多样性测试 | 完成 |
| 8. 掌握事件，p9–10 | 快照与事件分离、原因和证据、可回放 | `mastery_event`、history/explain/replay API | 回放匹配快照测试 | 完成 |
| 9. 错因状态，p11–12 | 反复错误、严重度、解决度、active/improving/resolved | `error_pattern_state`、`update_error_pattern` | 错因累计与复习改善测试 | 完成 |
| 10. 复习调度，p12–13 | 支持题目、知识点、方法、题型、思想、错因目标 | `review_schedule`、schedule query/explain | 作答/复习调度测试 | 完成 |
| 11. 复习事件，p13–14 | 记录每次复习；同步更新 schedule/mastery/event/context | `review_event`、`write_review_event` 事务链路 | review bundle 测试 | 完成 |
| 12. 上下文摘要，p14–16 | 压缩摘要、structured JSON、回溯 ID、active/superseded | `context_summary`、summary API、compression-status | bootstrap/压缩触发测试 | 完成；语义摘要由 Context Compressor Agent 生成 |
| 13. Agent 记忆，p16–17 | 多种 memory_type、重要度、新鲜度、过期、状态 | `agent_memory_item`、memory CRUD/expire | bootstrap 全记忆测试 | 完成 |
| 14. 当前上下文引用，p17–18 | active question/attempt/workflow/topic/review | `active_context_ref`、upsert/status/list API | bootstrap 测试 | 完成 |
| 15. 系统运行状态，p18 | Agent state key/value、恢复和前端展示 | `agent_runtime_state`、system runtime API | runtime/bootstrap 测试 | 完成 |
| 16. Workflow 运行，p19 | 名称、状态、输入输出、步骤、错误、起止时间 | `workflow_run`、system workflow API | 可观测性测试 | 完成 |
| 17. 工具调用日志，p19–20 | 工具输入、输出摘要、状态、错误、延迟 | `tool_call_log`、system tool API | 最近工具/日志测试 | 完成 |
| 18. 待写回状态，p20–22 | 四类 delta、事实门槛、字段/range/Workflow 校验、应用/拒绝 | `pending_state_delta`、`validate_and_apply_delta` | 四类 delta、无证据拒绝、Workflow guard 测试 | 完成 |
| 19. 本地事件日志，p22 | 轻量 event sourcing、调试、迁移和同步依据 | `local_event_log`、state/system event API | local event 查询测试 | 完成 |
| 20. system_kv，p23 | global/user/session 配置，不混业务数据 | `system_kv`、`ConfigService`、config API | 覆盖优先级和动态规则测试 | 完成 |
| 21. 推荐索引，p23–24 | session、turn、attempt、tag、mastery、review、memory、workflow、delta、event 索引 | migration 003，28 个索引 | schema 清单测试 | 完成 |
| 22. Agent 启动读取，p24–25 | user、summary、memory、due、weak、runtime、active workflow | `get_agent_bootstrap_context` | 完整 bootstrap 测试 | 完成 |
| 23. Prompt 拼接，p25–26 | 只拼学习快照与短期上下文，不拼完整历史/题库/日志 | bootstrap `prompt_policy`、compression-status | bootstrap 测试 | 完成 |
| 24. 掌握度规则，p26–27 | α/β 公式、标签权重、状态阈值、confidence、多样性 | `state_rules.py`、`system_kv` 参数 | 公式、配置和 mastered 多样性测试 | 完成 |
| 25. 复习调度规则，p27–28 | 四因素 priority、简化 SM-2、ease 调整 | `calculate_priority`、`update_review_schedule` | 复习链路和 explain 测试 | 完成 |
| 26. 系统/学习状态分离，p28–29 | mastery/error/review 与 runtime/workflow/tool/delta 分表 | migrations 001/002、不同 service/router | schema 与 API 测试 | 完成 |
| 27. MVP 表结构，p29–30 | 12 张 MVP 表并提前纳入 pending；扩展表可后做 | 本仓库直接实现完整 19 张业务表 + migration 表 | migration 测试 | 完成，超出 MVP |
| 28. SQLite API，p30–31 | Agent 通过业务 API，不直接 SQL | FastAPI/OpenAPI，71 个固定 operationId；业务统一入口 `/internal/tool-execution` | OpenAPI 唯一性测试 | 完成 |
| 29. 完整写入示例，p31–32 | 错题→标签→mastery/event→error→review→summary→workflow/tool | `scripts/demo_flow.py`、主链路 service | 端到端测试 | 完成 |
| 30. 最终定位，p32–33 | 回答最近学习、错题、错因、掌握、复习、原因、Workflow、工具、Prompt、未验证变化 | overview、wrong/mastery/error/review/explain/system/bootstrap/delta API | “final PDF questions” 测试 | 完成 |

## 设计中没有给出精确算法的部分

PDF 为以下部分保留了扩展空间，本仓库做了可替换且明确记录的工程选择：

- 首次接触先验：`mastery=0.50`、`confidence=0.10`；
- 部分掌握公式；
- confidence 增长和 recent_score 滑动；
- 真正 mastered 的多样性阈值；
- 错因解决度增长/衰减；
- `decay_rate` 的实际遗忘衰减应用；
- 标签低置信度通过 `weight × confidence` 降低影响。

全部参数均由 `system_kv` 驱动，可按小组决定修改，不需要改表结构。

## 外部模块边界

下列内容不是 SQLite PDF 要求由本仓库自行伪造的数据：

- PgSQL 中真实题干、答案、解析、知识点/方法资产和相似关系；
- `apps/api` 内的本地 Agent 与 Workflow 编排；
- Iris 前端交互与卡片渲染。

本仓库已提供 OpenAPI、PgSQL ID 校验客户端、数据合同、Docker 和部署说明，可以直接联调。详见 [`EXTERNAL_INTEGRATION_BOUNDARIES.md`](EXTERNAL_INTEGRATION_BOUNDARIES.md)。
