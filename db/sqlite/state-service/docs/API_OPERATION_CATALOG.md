# OpenAPI 操作完整目录

本文件由 `scripts/generate_api_catalog.py` 从 FastAPI OpenAPI 自动生成。

- Paths：65
- Operations：71
- `operationId`：全部唯一

## 服务元信息（4）

| operationId | HTTP | 路径 |
|---|---|---|
| `service_health` | `GET` | `/health` |
| `service_health_live` | `GET` | `/health/live` |
| `service_health_ready` | `GET` | `/health/ready` |
| `service_root` | `GET` | `/` |

## apps/api 内部 ToolExecutionPort（1）

| operationId | HTTP | 路径 |
|---|---|---|
| `tool_execution_execute` | `POST` | `/internal/tool-execution` |

## 用户学习事实、状态、记忆与复习（48）

| operationId | HTTP | 路径 |
|---|---|---|
| `state_apply_mastery_decay` | `POST` | `/api/v1/state/users/{user_id}/mastery/apply-decay` |
| `state_attach_attempt_tags` | `POST` | `/api/v1/state/attempts/{attempt_id}/tags` |
| `state_check_attempt` | `PATCH` | `/api/v1/state/attempts/{attempt_id}/grading` |
| `state_context_compression_status` | `GET` | `/api/v1/state/users/{user_id}/sessions/{session_id}/compression-status` |
| `state_create_pending_delta` | `POST` | `/api/v1/state/deltas` |
| `state_create_session` | `POST` | `/api/v1/state/sessions` |
| `state_create_user` | `POST` | `/api/v1/state/users` |
| `state_explain_mastery` | `GET` | `/api/v1/state/users/{user_id}/mastery/explain` |
| `state_explain_review_schedule` | `GET` | `/api/v1/state/review-schedules/{schedule_id}/explain` |
| `state_get_agent_bootstrap_context` | `GET` | `/api/v1/state/users/{user_id}/bootstrap-context` |
| `state_get_agent_memory` | `GET` | `/api/v1/state/memories/{memory_id}` |
| `state_get_attempt` | `GET` | `/api/v1/state/attempts/{attempt_id}` |
| `state_get_mastery_detail` | `GET` | `/api/v1/state/users/{user_id}/mastery/detail` |
| `state_get_pending_delta` | `GET` | `/api/v1/state/deltas/{delta_id}` |
| `state_get_review_event` | `GET` | `/api/v1/state/reviews/{review_event_id}` |
| `state_get_session` | `GET` | `/api/v1/state/sessions/{session_id}` |
| `state_get_state_overview` | `GET` | `/api/v1/state/users/{user_id}/overview` |
| `state_get_user` | `GET` | `/api/v1/state/users/{user_id}` |
| `state_list_active_context` | `GET` | `/api/v1/state/users/{user_id}/active-context` |
| `state_list_agent_memories` | `GET` | `/api/v1/state/users/{user_id}/memories` |
| `state_list_attempts` | `GET` | `/api/v1/state/users/{user_id}/attempts` |
| `state_list_context_summaries` | `GET` | `/api/v1/state/users/{user_id}/context-summaries` |
| `state_list_pending_deltas` | `GET` | `/api/v1/state/users/{user_id}/deltas` |
| `state_list_sessions` | `GET` | `/api/v1/state/users/{user_id}/sessions` |
| `state_list_turns` | `GET` | `/api/v1/state/sessions/{session_id}/turns` |
| `state_query_error_patterns` | `GET` | `/api/v1/state/users/{user_id}/error-patterns` |
| `state_query_local_events` | `GET` | `/api/v1/state/users/{user_id}/events` |
| `state_query_mastery` | `GET` | `/api/v1/state/users/{user_id}/mastery` |
| `state_query_mastery_history` | `GET` | `/api/v1/state/users/{user_id}/mastery/history` |
| `state_query_recent_learning` | `GET` | `/api/v1/state/users/{user_id}/recent-learning` |
| `state_query_review_due_items` | `GET` | `/api/v1/state/users/{user_id}/due-reviews` |
| `state_query_review_history` | `GET` | `/api/v1/state/users/{user_id}/review-history` |
| `state_query_review_schedules` | `GET` | `/api/v1/state/users/{user_id}/review-schedules` |
| `state_query_weak_items` | `GET` | `/api/v1/state/users/{user_id}/weak-items` |
| `state_query_wrong_questions` | `GET` | `/api/v1/state/users/{user_id}/wrong-questions` |
| `state_replay_mastery_history` | `GET` | `/api/v1/state/users/{user_id}/mastery/replay` |
| `state_update_active_context_status` | `PATCH` | `/api/v1/state/active-context/{context_id}` |
| `state_update_agent_memory` | `PATCH` | `/api/v1/state/memories/{memory_id}` |
| `state_update_context_summary` | `PUT` | `/api/v1/state/context-summary` |
| `state_update_mastery_from_attempt` | `POST` | `/api/v1/state/attempts/{attempt_id}/apply-state` |
| `state_update_session` | `PATCH` | `/api/v1/state/sessions/{session_id}` |
| `state_update_user` | `PATCH` | `/api/v1/state/users/{user_id}` |
| `state_upsert_active_context` | `PUT` | `/api/v1/state/active-context` |
| `state_validate_and_apply_delta` | `POST` | `/api/v1/state/deltas/{delta_id}/validate-and-apply` |
| `state_write_agent_memory` | `POST` | `/api/v1/state/memories` |
| `state_write_attempt_result` | `POST` | `/api/v1/state/attempts` |
| `state_write_review_event` | `POST` | `/api/v1/state/reviews` |
| `state_write_turn` | `POST` | `/api/v1/state/turns` |

## Workflow、工具调用、运行状态与日志（13）

| operationId | HTTP | 路径 |
|---|---|---|
| `system_create_workflow_run` | `POST` | `/api/v1/system/workflows` |
| `system_get_current_workflow` | `GET` | `/api/v1/system/users/{user_id}/current-workflow` |
| `system_get_last_tool_call` | `GET` | `/api/v1/system/users/{user_id}/last-tool-call` |
| `system_get_tool_call` | `GET` | `/api/v1/system/tool-calls/{tool_call_id}` |
| `system_get_workflow_run` | `GET` | `/api/v1/system/workflows/{run_id}` |
| `system_list_runtime_state` | `GET` | `/api/v1/system/users/{user_id}/runtime-state` |
| `system_list_tool_calls` | `GET` | `/api/v1/system/users/{user_id}/tool-calls` |
| `system_list_workflow_runs` | `GET` | `/api/v1/system/users/{user_id}/workflows` |
| `system_update_runtime_state_status` | `PATCH` | `/api/v1/system/runtime-state/{runtime_id}` |
| `system_update_workflow_run` | `PATCH` | `/api/v1/system/workflows/{run_id}` |
| `system_upsert_runtime_state` | `PUT` | `/api/v1/system/runtime-state` |
| `system_write_local_event` | `POST` | `/api/v1/system/events` |
| `system_write_tool_call` | `POST` | `/api/v1/system/tool-calls` |

## system_kv 配置（5）

| operationId | HTTP | 路径 |
|---|---|---|
| `config_delete_value` | `DELETE` | `/api/v1/config/values/{key}` |
| `config_get_effective_bundle` | `GET` | `/api/v1/config/effective` |
| `config_get_value` | `GET` | `/api/v1/config/values/{key}` |
| `config_list_values` | `GET` | `/api/v1/config/values` |
| `config_upsert_value` | `PUT` | `/api/v1/config/values` |
