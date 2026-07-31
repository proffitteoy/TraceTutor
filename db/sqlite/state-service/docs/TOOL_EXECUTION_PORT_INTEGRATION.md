# ToolExecutionPort 内部接入

## 调用拓扑

```text
LocalAgentRuntime / apps/api 工具路由
  → ToolExecutionPort
  → HttpSQLiteToolExecutionPort
  → POST /internal/tool-execution
  → SQLite State Service
```

Iris 和模型均不持有 SQLite 地址或 token。

## 请求

```http
POST /internal/tool-execution
Authorization: Bearer <service-token>
Content-Type: application/json
```

```json
{
  "tool": "state.write_attempt_result",
  "input": {
    "user_id": "U1",
    "session_id": "S1",
    "question_id": "Q1",
    "answer_text": "42",
    "judgement": "incorrect",
    "knowledge_point_ids": ["KP1"],
    "method_ids": ["M1"],
    "client_event_id": "attempt-001"
  },
  "context": {
    "request_id": "REQ1",
    "user_id": "U1",
    "session_id": "S1"
  }
}
```

服务会拒绝 `input` 与 `context` 用户/会话不一致的请求。

## 返回

```json
{
  "result": {
    "attempt_id": "A1",
    "idempotent": false,
    "pending_state_deltas": [
      {
        "pending_state_delta_id": "D1",
        "state_delta": {
          "target_type": "knowledge_mastery",
          "target_id": "KP1",
          "proposed_change": -0.1,
          "reason": "SQLite 规则层根据已判定作答和标签快照生成",
          "evidence": {
            "question_id": "Q1",
            "attempt_id": "A1",
            "judgement": "incorrect",
            "knowledge_point_ids": ["KP1"],
            "method_ids": ["M1"]
          }
        }
      }
    ]
  },
  "meta": {
    "source": "sqlite",
    "status": "ok",
    "reason": "作答事实已记录",
    "request_id": "REQ1"
  }
}
```

Runtime 必须使用服务返回的真实 `attempt_id` 和 pending 候选。应用时，SQLite 会再次根据数据库事实重建候选并做完全匹配，防止模型编造 ID 或状态变化。

## 能力

```text
state.query_user_snapshot
state.query_wrong_questions
state.query_review_due_items
state.write_attempt_result
state.write_review_result
state.apply_state_delta
log.write_agent_event
```

PgSQL 的 `asset.*` 能力不属于本服务。`apps/api` 最终需要组合两个实现，并仅在全部 15 个工具能力 ready 时报告整体就绪。

## 配置

状态服务：

```dotenv
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<shared-secret>
```

`apps/api`：

```dotenv
TRACE_TUTOR_SQLITE_SERVICE_URL=http://127.0.0.1:8000
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<shared-secret>
TRACE_TUTOR_SQLITE_TIMEOUT_MS=5000
```

## 安全要求

- 不提供任意 SQL 接口；
- 不允许 Iris 或模型直连；
- 每次请求校验用户和会话作用域；
- 写入必须携带幂等 `client_event_id`；
- 正式状态只由事实证据和确定性规则更新；
- 生产环境必须启用 Bearer service token；
- `/health/ready` 只用于状态检查，不替代业务能力校验。
