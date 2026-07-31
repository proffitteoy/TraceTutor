# 状态更新与复习规则

## 1. 不变量

- `question_attempt`、`review_event` 是事实；
- `mastery_state` 是当前快照；
- `mastery_event` 是可解释、可回放的变化历史；
- `review_schedule` 是当前计划；`review_event` 是实际发生的复习；
- Agent 只能提出建议；正式状态由规则层根据事实计算；
- `mastery_score` 与 `confidence_score` 分开；
- 学习状态和 Workflow 系统状态分开；
- 所有复合写入在 `BEGIN IMMEDIATE` 事务中完成；
- attempt/review 状态应用幂等。

## 2. 事实证据门槛

作答更新要求：

1. attempt 存在且属于用户；
2. 有 `question_id`；
3. 有明确判题结果，或明确 skipped；
4. 至少一条标签快照；
5. 标签类型、角色、权重和置信度合法；
6. 若配置 PgSQL 校验，引用必须通过；
7. 同一 attempt 尚未应用。

复习更新要求：

1. review_event 存在；
2. result 为 success/fail/partial/skipped；
3. schedule 若存在，必须属于同一用户且目标一致；
4. 复习知识点/方法等实体时目标本身就是证据；
5. 复习 question 时必须传 `evidence_tags`；
6. 同一 review_event 尚未应用。

## 3. 首次接触先验

PDF 没有规定首次接触的精确先验。本实现默认：

```text
initial_mastery = 0.50
initial_confidence = 0.10
```

这样首次答错能够从先验下降，避免“未接触”和“接触后答错”都停留在 0。参数由 `system_kv` 配置。

## 4. 有效标签权重

如果请求没有显式传 `weight`，服务按 `tag_type + role` 从 `tag_weight_matrix` 取默认值。最终作用量为：

```text
effective_weight = clamp(weight × tag_confidence, 0, 1)
```

默认起点：

| 标签/角色 | 权重 |
|---|---:|
| 主知识点 | 1.0 |
| 辅助知识点 | 0.5 |
| 主方法 | 1.0 |
| 隐藏方法 | 0.7 |
| 主解题思想 | 0.9 |
| 主题型结构 | 0.6 |

低置信度 AI 标注对长期状态的影响会相应降低。

## 5. 掌握度公式

答对：

```text
new = old + α × effective_weight × (1 - old)
```

答错：

```text
new = old - β × effective_weight × old
```

部分掌握：

```text
new = old + partial_pull × effective_weight × (0.60 - old)
```

默认：

```text
α = 0.12
β = 0.18
partial_pull = 0.03
```

所有结果限制在 0–1，并受单次最大变化安全阈值约束。

## 6. 置信度和近期表现

每次有效事实增加判断置信度：

```text
new_confidence = old_confidence
               + confidence_gain × effective_weight × (1 - old_confidence)
```

近期表现：

```text
new_recent = 0.70 × old_recent + 0.30 × evidence
```

```text
success = 1.0
partial = 0.5
fail = 0.0
```

## 7. 状态标签与题目多样性

| 条件 | 标签 |
|---|---|
| 无接触 | `unseen` |
| mastery < 0.20 | `exposed` |
| 0.20 ≤ mastery < 0.45 | `weak` |
| 0.45 ≤ mastery < 0.65 | `learning` |
| 0.65 ≤ mastery < mastered 阈值，证据不稳 | `reviewing` |
| 0.65 以上且 confidence/recent 稳定 | `stable` |
| 达到全部高置信和多样性条件 | `mastered` |

默认 `mastered` 同时要求：

```text
mastery >= 0.80
confidence > 0.70
exposure_count >= 5
distinct question_id >= 5
distinct structure >= 2
distinct difficulty >= 2
```

系统还统计不同方法数量并在详情/bootstrap 中返回。多样性从历史 attempt/review 的结构化证据计算，不再只用 exposure_count 代理。

## 8. 错因状态

失败时：

- `occurrence_count + 1`；
- severity 按剩余空间增加；
- resolved_score 下降；
- 状态通常为 active；
- 关联主要标签；
- 写 local event。

之后对关联标签复习成功或部分成功时：

- severity 下降；
- resolved_score 上升；
- 状态可变为 `improving`；
- 达到阈值后变为 `resolved`。

默认参数由：

```text
error_severity_gain
error_resolution_success_gain
error_resolution_partial_gain
error_resolution_fail_loss
```

控制。

## 9. 复习优先级

```text
priority =
0.35 × (1 - mastery)
+ 0.25 × severity
+ 0.25 × due
+ 0.15 × importance
```

返回值包含总分和四个 component，`state_explain_review_schedule` 可解释来源。权重由 `review_priority_weights` 动态配置。

## 10. 简化 SM-2

| 结果 | interval_days | ease_factor |
|---|---|---|
| fail | 1 | -0.20，最低 1.30 |
| partial | `max(1, old × 1.30)` | -0.05 |
| success | `max(1, old × ease)` | +0.05 |
| skipped | 保持 | 保持 |

作答会创建或调整实体复习计划；真正复习会增加 `review_count` 并记录 `last_result`。

## 11. pending delta 安全门

### `mastery_update`

必须绑定 attempt 或 review_event。请求的实体必须在事实标签快照中；可声明期望方向，但最终数值由规则计算。

### `error_pattern_update`

必须有 attempt/review 事实。失败可累计错因，成功/部分成功可改善已有错因。

### `review_schedule_update`

必须有事实，目标必须是事实中的 question 或标签/复习目标；priority 和间隔由规则计算。

### `memory_update`

允许记录可观察的软状态摘要，即使没有 attempt/review；它不会修改 mastery。

所有 delta 还会检查允许字段、变化范围和 Workflow 状态/步骤。

## 12. system_kv 动态配置

优先级：

```text
session > user > global
```

可配置：

- α、β、partial pull、先验；
- confidence/recent 参数；
- mastered 阈值与多样性；
- tag 权重矩阵；
- priority 权重；
- SM-2 最小 ease；
- 错因消退；
- 单次变化安全范围；
- 允许写回的 Workflow status/current_step；
- 上下文压缩阈值。

## 13. 遗忘衰减

PDF 在表中预留 `decay_rate`，但没有给出精确衰减公式。本实现提供显式 `state_apply_mastery_decay`：只在调用时按距上次接触的时间和 `decay_rate` 计算，写 `mastery_event(delta_reason=decay)`，不会在读取时偷偷改状态。

## 14. 回放与解释

- `state_query_mastery_history`：按时间查询事件；
- `state_explain_mastery`：返回快照、多样性和最近证据；
- `state_replay_mastery_history`：按事件 old/new 链重构，检查是否与快照一致；
- `state_explain_review_schedule`：返回调度依据和历史复习；
- `state_query_local_events`：查看跨聚合事件流。
