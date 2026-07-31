# API 与 Agent 工具设计

FastAPI 自动生成 OpenAPI，供本地维护、诊断和契约核对使用。TraceTutor 正常业务通过 `apps/api` 的 `ToolExecutionPort` 调用 `/internal/tool-execution`，不让 Iris 或模型直接使用细粒度接口，也不暴露 `execute_sql(sql)`。完整 71 个 operationId 见 [`API_OPERATION_CATALOG.md`](API_OPERATION_CATALOG.md)。

## 1. PDF 建议接口的实现映射

| PDF 中的业务接口 | 本仓库 operationId |
|---|---|
| `state.get_agent_bootstrap_context` | `state_get_agent_bootstrap_context` |
| `state.create_session` | `state_create_session` |
| `state.write_turn` | `state_write_turn` |
| `state.write_attempt_result` | `state_write_attempt_result` |
| `state.attach_attempt_tags` | `state_attach_attempt_tags` |
| `state.update_mastery_from_attempt` | `state_update_mastery_from_attempt` |
| `state.query_weak_items` | `state_query_weak_items` |
| `state.query_due_reviews` | `state_query_review_due_items` |
| `state.write_review_event` | `state_write_review_event` |
| `state.update_context_summary` | `state_update_context_summary` |
| `state.write_agent_memory` | `state_write_agent_memory` |
| `system.create_workflow_run` | `system_create_workflow_run` |
| `system.update_workflow_run` | `system_update_workflow_run` |
| `system.write_tool_call` | `system_write_tool_call` |

此外实现了事实回查、状态解释、事件回放、运行状态、配置、错因、调度、local events、状态总览等接口。

## 2. 标准作答链路

```text
system_create_workflow_run
        ↓
state_create_session（没有 active session 时）
        ↓
state_write_turn
        ↓
PgSQL/判题工具返回 question_id、结果和标签
        ↓
state_write_attempt_result
        ↓
state_attach_attempt_tags
        ↓
state_update_mastery_from_attempt
        ↓
规则层创建并应用 pending_state_delta
        ↓
mastery_state + mastery_event
error_pattern_state + review_schedule
context_summary + agent_memory_item
local_event_log
        ↓
system_write_tool_call
        ↓
system_update_workflow_run
```

`state_update_mastery_from_attempt` 是幂等操作；同一 attempt 重试不会重复计数。

## 3. 标准复习链路

```text
state_get_agent_bootstrap_context
        ↓
state_query_review_due_items
        ↓
PgSQL 召回复习题
        ↓
用户完成复习
        ↓
state_write_review_event
        ↓
同步更新 review_schedule、mastery_state、mastery_event、
error_pattern_state、context_summary、agent_memory_item、local_event_log
```

题目级复习应在 `evidence_tags` 中附上知识点、方法、结构或解题思想快照，保证状态变化有结构化证据。

## 4. pending state delta

支持四种类型：

```text
mastery_update
error_pattern_update
review_schedule_update
memory_update
```

规则层检查：

1. attempt 或 review_event 是否真实存在；
2. 判题/复习结果是否明确；
3. question/tag/reference 是否存在；
4. 目标实体是否属于记录的标签快照；
5. delta 字段是否在允许集合；
6. mastery、confidence、priority 变化是否在配置范围；
7. 来源 Workflow 状态和 current_step 是否允许写回；
8. 用户、session、attempt、review、workflow 是否属于同一用户。

无事实证据的 `mastery_update` 会保留审计记录并标记 `rejected`。`memory_update` 可以保存软判断，但不会修改正式掌握度。

## 5. 作答示例

### 5.1 记录事实

```json
{
  "user_id": "user-001",
  "session_id": "session-001",
  "question_id": "2d36e59e-e5c8-4ad2-8546-722d5a59f8ca",
  "source_type": "pgsql",
  "user_answer_text": "1",
  "is_correct": false,
  "score": 0,
  "time_spent_seconds": 180,
  "main_error_type": "method_selection_error",
  "error_detail_text": "不会主动构造上下界"
}
```

### 5.2 保存标签快照

`weight` 可以省略；服务会从 `system_kv.tag_weight_matrix` 按 `tag_type + role` 取默认值。标签 `confidence` 会参与有效权重计算。

```json
{
  "tags": [
    {
      "tag_type": "knowledge_point",
      "tag_id": "8c906310-8b58-4e63-9303-018c7696121d",
      "tag_name": "数列极限",
      "role": "primary",
      "confidence": 1.0
    },
    {
      "tag_type": "method",
      "tag_id": "f9cd991c-df93-4924-a273-bca62452d89f",
      "tag_name": "夹逼估计",
      "role": "primary",
      "confidence": 1.0
    },
    {
      "tag_type": "thinking_pattern",
      "tag_name": "主动构造上下界",
      "role": "hidden",
      "confidence": 0.9
    }
  ]
}
```

### 5.3 应用状态

```http
POST /api/v1/state/attempts/{attempt_id}/apply-state
```

调用方不提交最终分数。规则层返回每个实体的旧值、新值、置信度、状态标签、复习时间、优先级及证据。

## 6. 解释与回放

| operationId | 回答的问题 |
|---|---|
| `state_explain_mastery` | 为什么系统认为某知识点/方法薄弱或稳定？ |
| `state_replay_mastery_history` | 事件序列能否重构并匹配当前快照？ |
| `state_explain_review_schedule` | 为什么安排这次复习，优先级来自哪些因素？ |
| `state_get_state_overview` | 最近学习、错题、错因、下一复习、Workflow、最近工具、未验证 delta 是什么？ |
| `state_query_local_events` | 本地状态链路发生过哪些事件？ |

## 7. Agent bootstrap

`state_get_agent_bootstrap_context` 返回：

- user/profile/session 快照；
- 最新 session/topic/profile/workflow summary；
- 最近 active memories（不只 open loop）；
- active context refs；
- Agent runtime state；
- weak mastery 和多样性证据；
- due reviews；
- recent error patterns；
- active workflow；
- 最近 3–5 轮必要对话；
- effective system_kv；
- Prompt include/exclude 策略。

它不会返回完整题库、完整解析、全部历史对话或全部工具日志。

## 8. system_kv

配置支持三层覆盖：

```text
session > user > global
```

规则引擎每次更新状态时读取最终生效配置。可以调整 α、β、置信度增益、mastered 多样性阈值、复习权重、错因消退、上下文压缩阈值、允许写回的 Workflow 状态等，不需要改代码或重建数据库。

## 9. 错误语义

| HTTP/返回 | 含义 |
|---|---|
| 404 | 用户、session、attempt、review、workflow 等不存在 |
| 409 | 主键或唯一约束冲突 |
| 422 | 事实证据不足、引用无效、跨用户绑定、目标不一致、参数越界 |
| 200 + `validation_status=rejected` | delta 已完成审计并被规则层明确拒绝，不是服务异常 |

## 10. 日志最小化

`tool_call_log.output_summary_json` 只存摘要、计数和引用 ID。完整题目、答案、解析和大候选结果必须回 PgSQL 资产服务查询。
