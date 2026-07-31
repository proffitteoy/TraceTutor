# SQLite 子系统架构

## 系统位置

```text
Iris
  ↓ HTTP
apps/api + LocalAgentRuntime
  ↓ ToolExecutionPort
HttpSQLiteToolExecutionPort
  ↓ 内部 HTTP + Bearer service token
SQLite State Service
  ↓
SQLite 用户状态文件
```

`apps/api` 是唯一公开业务入口。SQLite 状态服务不承担 Agent 编排，也不向 Iris、模型或外部平台公开数据库能力。

## 数据边界

SQLite 保存四类数据：

- 学习事实：`learning_session`、`question_attempt`、`question_attempt_tag`、`review_event`；
- 学习状态：`mastery_state`、`mastery_event`、`error_pattern_state`、`review_schedule`；
- Agent 上下文：`context_summary`、`agent_memory_item`、`active_context_ref`；
- 运行与审计：`agent_runtime_state`、`workflow_run`、`tool_call_log`、`pending_state_delta`、`local_event_log`、`system_kv`、`schema_migration`。

完整题目、答案、解析、相似关系和审核状态属于 PgSQL。SQLite 只保存资产 ID 和支持历史解释所需的标签快照，不建立跨库外键。

## 写回事务

作答或复习先写不可变事实，再生成 pending delta：

```text
attempt / review event
  → evidence tag snapshot
  → pending_state_delta
  → ToolExecutionPort 返回候选
  → apps/api 引用候选调用 apply
  → SQLite 核对候选与事实一致
  → mastery / error / review schedule / context / event log
```

同一写事务使用 `client_event_id` 幂等。Agent 不能提供自由分数覆盖正式状态；正式数值由确定性规则计算。

## 读取与运行日志

`state.query_user_snapshot`、`state.query_wrong_questions` 和 `state.query_review_due_items` 向 Agent 提供经过压缩的用户状态，不扫描或暴露完整内部表。

`log.write_agent_event` 把 Agent 运行事件关联到当前用户、会话和 workflow，供恢复与审计使用。

## 运行约束

- 单个本地/内网 FastAPI 写实例；
- SQLite 文件位于同机持久化磁盘；
- 不在 NFS/SMB 上让多个副本同时写同一文件；
- 正式改表只通过版本化 migration；
- 生产环境必须启用内部 Bearer token。

