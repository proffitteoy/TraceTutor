# SQLite 数据字典

所有业务主键均为 `TEXT`，由应用层生成 UUID。时间使用 UTC 文本 `YYYY-MM-DD HH:MM:SS`。JSON 使用 `TEXT` 保存 UTF-8 JSON。PgSQL 资产 UUID 在 SQLite 中保存为字符串，不建立跨库外键。

## 1. `schema_migration`

用途：记录已应用的 schema 版本，是表结构的唯一升级依据。

| 字段 | 含义 |
|---|---|
| `version` | migration 数字版本，主键 |
| `name` | migration 文件名中的描述 |
| `applied_at` | 应用时间 |

## 2. `user_profile`

用途：保存学习系统运行所需的用户配置，不是长期隐私画像。

| 字段 | 含义 |
|---|---|
| `user_id` | 用户主键 |
| `display_name` | 展示名称 |
| `current_subject` | 当前学科 |
| `current_stage` | 当前阶段 |
| `preference_json` | 讲解风格、难度、是否展示步骤等 |
| `created_at` / `updated_at` | 创建和更新时间 |

## 3. `learning_session`

用途：一次打开 Iris 或一次连续学习任务的边界。

| 字段 | 含义 |
|---|---|
| `id` | session 主键 |
| `user_id` | 所属用户 |
| `session_type` | new_question / review / diagnosis / free_chat / mixed 等 |
| `subject` / `topic` | 当前学科与主题 |
| `status` | active / completed / interrupted / failed |
| `started_at` / `ended_at` | 起止时间 |
| `summary_text` | 可选的简短 session 摘要 |
| `metadata_json` | 扩展元数据 |

## 4. `conversation_turn`

用途：保留必要原始对话事实。主 Agent 不应每轮读取全表。

| 字段 | 含义 |
|---|---|
| `id` | turn 主键 |
| `session_id` / `user_id` | 所属会话与用户 |
| `role` | user / assistant / tool / system |
| `content_text` | 内容 |
| `content_type` | text / question / answer / tool_result / render_json 等 |
| `token_estimate` | 估算 token |
| `related_question_id` | 关联 PgSQL 题目 UUID 字符串 |
| `related_attempt_id` | 关联本地作答 |
| `metadata_json` | 扩展信息 |

## 5. `question_attempt`

用途：最重要的事实表之一，记录一次用户作答。

| 字段 | 含义 |
|---|---|
| `id` | attempt 主键 |
| `user_id` / `session_id` | 用户与会话 |
| `question_id` | PgSQL `question_asset.id` 的字符串，或临时题 ID |
| `source_type` | pgsql / generated_draft / user_input |
| `user_answer_text` | 用户答案 |
| `is_correct` | 1 正确、0 错误、NULL 未判定 |
| `score` | 0–1 分数 |
| `attempt_status` | viewed / submitted / checked / abandoned / skipped |
| `time_spent_seconds` | 用时 |
| `difficulty_level` | 1–5，作答当时难度快照 |
| `main_error_type` | knowledge_gap / method_selection_error / calculation_error 等 |
| `error_detail_text` | 更具体的错因 |
| `confidence_self_report` | 用户自评信心 0–1 |
| `state_applied_at` | 确定性规则是否已处理，用于幂等 |
| `checked_at` | 判题时间 |
| `metadata_json` | 任务来源等扩展信息 |

禁止在本表中直接写“用户掌握了极限”。

## 6. `question_attempt_tag`

用途：保存作答发生时的标签快照，避免 PgSQL 后续改标签导致历史不可解释。

| 字段 | 含义 |
|---|---|
| `id` | 快照主键 |
| `attempt_id` | 所属作答 |
| `tag_type` | knowledge_point / method / question_type / structure / thinking_pattern |
| `tag_id` | 对应 PgSQL 资产 UUID 字符串，可空 |
| `tag_name` | 当时名称 |
| `role` | primary / secondary / prerequisite / hidden / alternative |
| `weight` | 对掌握度影响权重 |
| `confidence` | 标签可信度 |

## 7. `mastery_state`

用途：用户对一个知识点、方法、题型、结构或解题思想的当前快照。

| 字段 | 含义 |
|---|---|
| `id` | 状态主键 |
| `user_id` | 所属用户 |
| `entity_type` | knowledge_point / method / question_type / structure / thinking_pattern |
| `entity_id` | PgSQL ID 字符串；本地临时思想标签可空 |
| `entity_name` | 稳定展示名，也是本实现的唯一键组成部分 |
| `mastery_score` | 掌握度 0–1 |
| `confidence_score` | 系统对掌握判断的置信度 0–1 |
| `exposure_count` | 接触次数 |
| `correct_count` / `wrong_count` | 正确与错误次数 |
| `recent_score` | 近期表现滑动值 |
| `state_label` | unseen / exposed / learning / weak / reviewing / stable / mastered |
| `last_seen_at` | 最近接触 |
| `last_success_at` / `last_failure_at` | 最近成功与失败 |
| `next_review_at` | 下一复习时间的冗余快照 |
| `decay_rate` | 预留遗忘衰减参数 |
| `updated_at` | 更新时间 |

唯一约束：`user_id + entity_type + entity_name`。

## 8. `mastery_event`

用途：记录每一次掌握状态变化，使状态可解释、可回放。

| 字段 | 含义 |
|---|---|
| `id` | 事件主键 |
| `user_id` | 所属用户 |
| `mastery_state_id` | 被修改的快照 |
| `attempt_id` / `review_event_id` | 事实证据来源，二者至少一个用于正式变化 |
| `entity_type` / `entity_id` / `entity_name` | 变化对象快照 |
| `old_mastery_score` / `new_mastery_score` | 变化前后掌握度 |
| `old_confidence_score` / `new_confidence_score` | 变化前后置信度 |
| `old_state_label` / `new_state_label` | 标签变化 |
| `delta_reason` | correct_answer / wrong_answer / review_success / review_failed 等 |
| `evidence_text` | attempt、question 或 review 引用 |
| `metadata_json` | 扩展证据 |

## 9. `error_pattern_state`

用途：累计反复出现的错因，而不是只记录单次错误。

| 字段 | 含义 |
|---|---|
| `id` | 错因状态主键 |
| `user_id` | 所属用户 |
| `error_type` | 错误大类 |
| `error_pattern_name` | 具体模式，例如“不会主动构造上下界” |
| `related_entity_type` / `related_entity_name` | 关联的知识点、方法或思想 |
| `occurrence_count` | 出现次数 |
| `severity_score` | 严重度 0–1 |
| `last_occured_at` | 最近出现时间（字段名沿用原设计拼写） |
| `resolved_score` | 已解决程度 0–1 |
| `status` | active / improving / resolved / ignored |
| `updated_at` | 更新时间 |

## 10. `review_schedule`

用途：复习调度当前快照。复习目标不限于题目。

| 字段 | 含义 |
|---|---|
| `id` | 调度主键 |
| `user_id` | 所属用户 |
| `target_type` | question / knowledge_point / method / question_type / structure / thinking_pattern / error_pattern |
| `target_id` | 资产 ID 或本地 ID，可空 |
| `target_name` | 展示名 |
| `priority_score` | 复习优先级 0–1 |
| `due_at` | 到期时间 |
| `interval_days` | 当前间隔天数 |
| `ease_factor` | 简化 SM-2 易度因子 |
| `review_count` | 实际复习次数 |
| `last_review_at` / `last_result` | 上次复习时间与结果 |
| `status` | scheduled / due / completed / suspended / cancelled |
| `metadata_json` | 重要性等扩展信息 |

唯一约束：`user_id + target_type + target_name`。

## 11. `review_event`

用途：一次实际复习事实。

| 字段 | 含义 |
|---|---|
| `id` | 复习事件主键 |
| `user_id` / `session_id` | 用户与会话 |
| `schedule_id` | 对应调度项，可空 |
| `review_type` | old_question_review / same_knowledge_new_question / method_transfer / error_pattern_review 等 |
| `target_type` / `target_id` / `target_name` | 复习目标 |
| `result` | success / fail / partial / skipped |
| `score` | 0–1 |
| `user_feedback_text` | 用户反馈 |
| `agent_review_summary` | 教学摘要 |
| `next_review_at` | 本次计算出的下次时间 |
| `state_applied_at` | 规则是否已应用，用于幂等 |
| `metadata_json` | 扩展信息；question 复习可保存 evidence_tags |

## 12. `context_summary`

用途：给 Agent 拼 Prompt 的压缩上下文，不是完整对话。

| 字段 | 含义 |
|---|---|
| `id` | 摘要主键 |
| `user_id` / `session_id` | 用户与可选会话 |
| `summary_scope` | turn / session / topic / profile / workflow |
| `summary_text` | 可读摘要 |
| `structured_json` | current topic、weak points、open loops、引用 ID 等 |
| `source_turn_start_id` / `source_turn_end_id` | 回溯区间 |
| `token_estimate` | 估算 token |
| `confidence` | 摘要可信度 |
| `status` | active / superseded / deprecated |

写入新摘要时，服务会把同范围旧摘要标记为 `superseded`，保留历史。

## 13. `agent_memory_item`

用途：可检索短期记忆条目，只保存可观察学习状态，不保存隐藏推理。

| 字段 | 含义 |
|---|---|
| `id` | 记忆主键 |
| `user_id` | 所属用户 |
| `memory_type` | short_term / working / learning_preference / open_loop / warning / strategy |
| `title` / `content_text` | 标题与内容 |
| `related_entity_type` / `related_entity_id` / `related_entity_name` | 关联对象 |
| `importance_score` | 重要度 |
| `freshness_score` | 新鲜度 |
| `expires_at` | 可选过期时间 |
| `status` | active / resolved / expired / deprecated |
| `metadata_json` | 扩展信息 |

## 14. `active_context_ref`

用途：指出 Agent 当前正在处理的题目、作答、Workflow、主题或复习项。

| 字段 | 含义 |
|---|---|
| `id` | 本地引用主键 |
| `user_id` / `session_id` | 用户与会话 |
| `ref_type` | active_question / active_attempt / active_workflow / active_topic / active_review |
| `ref_id` | 被引用对象 ID |
| `ref_name` | 展示名 |
| `status` | active / resolved / abandoned |

## 15. `agent_runtime_state`

用途：系统恢复和前端进度展示，不等同于学习状态。

| 字段 | 含义 |
|---|---|
| `id` | 状态主键 |
| `user_id` / `session_id` | 用户与会话 |
| `agent_name` | main_agent / intent_planner / review_agent 等 |
| `state_key` | current_workflow / current_step / pending_state_delta_id 等 |
| `state_value_json` | 结构化值 |
| `status` | active / superseded / cleared |

## 16. `workflow_run`

用途：一次 TraceTutor 本地 Agent Workflow 的运行快照。

| 字段 | 含义 |
|---|---|
| `id` | 运行主键 |
| `user_id` / `session_id` | 用户与会话 |
| `workflow_name` | new_question_solve / review / method_transfer / context_compress 等 |
| `status` | running / succeeded / failed / cancelled / waiting_user |
| `input_json` / `output_json` | 精简输入和输出摘要 |
| `current_step` | 当前状态机步骤 |
| `error_message` | 失败原因 |
| `started_at` / `completed_at` | 起止时间 |
| `metadata_json` | token、模型版本等扩展信息 |

## 17. `tool_call_log`

用途：记录每次工具调用，否则无法排查错误召回或写回失败。

| 字段 | 含义 |
|---|---|
| `id` | 调用主键 |
| `workflow_run_id` | 所属 Workflow |
| `user_id` / `session_id` | 用户与会话 |
| `tool_name` | 业务工具名，不是裸 SQL |
| `input_json` | 精简输入 |
| `output_summary_json` | 输出摘要；完整题目仍回 PgSQL 查 |
| `status` | succeeded / failed / timeout / skipped |
| `error_message` | 错误 |
| `latency_ms` | 延迟 |

## 18. `pending_state_delta`

用途：状态写回安全门。Agent 建议先进入本表，再由规则层验证。

| 字段 | 含义 |
|---|---|
| `id` | delta 主键 |
| `user_id` / `session_id` | 用户与会话 |
| `workflow_run_id` | 来源 Workflow |
| `attempt_id` / `review_event_id` | 事实证据引用 |
| `delta_type` | mastery_update / error_pattern_update / review_schedule_update / memory_update |
| `proposed_by` | agent / rule / user / system |
| `delta_json` | 建议内容 |
| `validation_status` | pending / approved / rejected / applied |
| `validation_reason` | 校验依据或拒绝原因 |
| `validated_at` / `applied_at` | 校验与应用时间 |

同一 attempt 的有效 `mastery_update` 通过部分唯一索引保证幂等。

## 19. `local_event_log`

用途：轻量事件日志，用于回放、调试、云端同步和将来迁移。

| 字段 | 含义 |
|---|---|
| `id` | 事件主键 |
| `user_id` / `session_id` | 用户与会话 |
| `event_type` | attempt_created / mastery_updated / review_recorded 等 |
| `aggregate_type` / `aggregate_id` | 事件所属聚合 |
| `event_json` | 精简事件载荷 |

## 20. `system_kv`

用途：系统级参数，不存业务事实。

| 字段 | 含义 |
|---|---|
| `key` | 配置键 |
| `value_json` | JSON 值 |
| `scope` | global / user / session |
| `updated_at` | 更新时间 |

默认包含上下文阈值、掌握度公式、置信度、多样性、标签权重、复习优先级、错因消退和 Workflow 写回约束。对外逻辑 key 支持 global/user/session；非 global 值在物理 key 中带作用域前缀。

## 视图

| 视图 | 用途 |
|---|---|
| `v_due_review` | 当前已到期调度项 |
| `v_weak_mastery` | 非稳定掌握项 |
| `v_attempt_with_session` | 作答与 session 主题联合查询 |
| `v_unverified_state_delta` | pending/approved 但尚未正式应用的状态变化 |
| `v_recent_learning` | 按 session 聚合最近学习和正确/错误次数 |
