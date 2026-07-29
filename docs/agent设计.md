# 本地 Agent Runtime 设计

## 1. 定位

TraceTutor 不再依赖扣子或其他外部 Agent 平台。Agent Runtime 直接运行在 `apps/api` 进程内，模型仅通过 OpenAI-compatible Chat Completions API 接入。

```text
Iris
  ↓ POST /agent/chat
Fastify API
  ↓
LocalAgentRuntime
  ├─ 模型 API：意图 / QueryPlan
  ├─ 本地规则：计划校验与工具物化
  ├─ ToolExecutionPort：PgSQL / SQLite 业务工具
  ├─ 本地规则：引用、证据与状态写回校验
  └─ 模型 API：教学卡片组织
  ↓
LearningResponse
```

本地化的是：

- Workflow 状态机；
- Prompt；
- 查询计划 Schema 与白名单；
- 工具调度；
- 结果压缩；
- ID 引用检查；
- 作答写入与 pending state delta 协调；
- 最终响应校验。

模型 API 可以指向本机推理服务，也可以指向用户控制的模型网关。模型服务只负责结构化生成，不拥有数据库连接、工具权限或状态写权限。

## 2. 代码落点

```text
apps/api/src/
├── agent/
│   ├── local-agent.ts   # 本地 Workflow 与状态机
│   ├── local-model.ts   # OpenAI-compatible 模型 API
│   └── prompts.ts       # 计划与教学 Prompt
├── contracts.ts         # QueryPlan / LearningResponse / StateDelta
├── tool-schemas.ts      # 工具输入 Schema 与静态路由
└── ports.ts             # ToolExecutionPort
```

不再维护 `agents/coze`、插件 OpenAPI 或平台导出物。Agent 是 API 应用的一部分，与请求、鉴权、工具和日志在同一部署单元内运行。

## 3. 单轮状态机

`LocalAgentRuntime.run` 的固定顺序是：

```text
REQUEST_ACCEPTED
  ↓
PLAN_GENERATED
  ↓
PLAN_VALIDATED
  ↓
TOOL_CALLS_MATERIALIZED
  ↓
TOOLS_EXECUTED
  ↓
OPTIONAL_ANSWER_GRADED
  ↓
OPTIONAL_ATTEMPT_WRITTEN
  ↓
OPTIONAL_PENDING_DELTAS_APPLIED
  ↓
TEACHING_OUTPUT_GENERATED
  ↓
REFERENCES_VALIDATED
  ↓
RESPONSE_VALIDATED
  ↓
DONE
```

异常不跨阶段伪装成功：

- 模型 API 不可用：`MODEL_UNAVAILABLE`。
- 模型 JSON 不符合 Schema：`MODEL_OUTPUT_INVALID`。
- 查询缺少工具必需参数：该调用标记为 `skipped`。
- 数据库端口未接：工具观察标记为 `unavailable`，教学输出必须说明降级。
- 工具执行失败：标记为 `failed`，其他可执行阶段继续。
- 模型引用未知题目 ID：整个响应拒绝。

## 4. QueryPlan

模型第一步只输出查询计划，不解题：

```json
{
  "version": "1.0",
  "intent": "REVIEW_AND_VARIANT",
  "task_types": [
    "REVIEW_OLD_QUESTION",
    "GENERATE_SIMILAR_QUESTION",
    "METHOD_TRANSFER"
  ],
  "state_queries": [
    {
      "tool": "state.query_wrong_questions",
      "filters": {
        "knowledge_area": "极限",
        "state_labels": ["weak", "reviewing"]
      },
      "limit": 5
    }
  ],
  "asset_queries": [
    {
      "tool": "asset.search_same_knowledge_different_method",
      "base_question_id": "Q123",
      "filters": {
        "only_active": true
      },
      "difficulty_policy": "near",
      "limit": 3
    }
  ],
  "expected_output": {
    "include_old_review": true,
    "include_new_question": true,
    "include_method_comparison": true,
    "include_state_update": true
  }
}
```

本地规则随后完成：

- 枚举白名单校验；
- `limit <= 20`；
- 拒绝 `sql`、`query`、`where_clause`、`raw_sql`；
- 把用户、会话和当前题目引用注入具体工具输入；
- 用每个工具自己的 Zod Schema 再校验一次。

模型永远不会直接控制最终工具参数，也不能输出 SQL。

## 5. 工具

### 状态读取

- `state.query_user_snapshot`
- `state.query_wrong_questions`
- `state.query_review_due_items`

### 状态写入

- `state.write_attempt_result`
- `state.write_review_result`
- `state.apply_state_delta`

### 题目资产

- `asset.get_question_detail`
- `asset.search_by_knowledge`
- `asset.search_by_method`
- `asset.search_same_knowledge_different_method`
- `asset.search_same_method_different_knowledge`
- `asset.search_similar_questions`
- `asset.create_draft_question`
- `asset.get_solution_steps`

### 日志

- `log.write_agent_event`

所有工具都通过 `ToolExecutionPort` 执行。数据库实现只接触这个端口，不向 Agent 暴露连接、ORM、repository 或 SQL。

## 6. 模型 API

配置项：

```text
MODEL_API_BASE_URL
MODEL_API_KEY
MODEL_NAME
MODEL_RESPONSE_FORMAT
MODEL_TIMEOUT_MS
```

调用使用 OpenAI-compatible：

```text
POST {MODEL_API_BASE_URL}/chat/completions
```

计划、作答判定和教学输出都使用 `response_format.type = json_schema`，返回后仍由本地 Zod Schema 复验。模型 API 返回成功不代表输出可被系统接受。

模型 API 没有以下权限：

- 访问数据库；
- 调用工具；
- 持久化上下文；
- 决定正式状态；
- 创建可信 ID。

## 7. 教学输出

模型只生成：

```text
summary
cards
actions
```

本地 Runtime 补充：

```text
render_type
mode
pending_state_write
meta.request_id
meta.workflow_run_id
meta.source = local_agent
```

题目卡与动作中的 `question_id` 必须来自：

- 当前 `active_question_id`；或
- 本轮工具结果。

否则返回 `MODEL_OUTPUT_INVALID`。

## 8. 用户动作

Iris 在用户点击动作后，将下面结构放入下一次 `LearningRequest`：

```json
{
  "action": {
    "type": "submit_answer",
    "question_id": "Q123",
    "client_event_id": "browser-generated-uuid"
  }
}
```

动作类型：

- `submit_answer`
- `request_hint`
- `generate_variant`

`client_event_id` 用于数据库写入幂等。前端不会自己判题或修改状态。

## 9. 作答与状态写回

只有 `submit_answer` 且存在 `active_question_id` 时才进入判题流程：

```text
读取 active question 与 solution
  ↓
模型输出 judgement + feedback + 已知标签 ID
  ↓
本地过滤工具未返回的标签 ID
  ↓
state.write_attempt_result
  ↓
数据库规则层返回 pending_state_deltas
  ↓
本地 StateDelta Schema 复验
  ↓
state.apply_state_delta
```

强约束：

- 没有题目详情或解题步骤时不判题。
- 没有真实 `attempt_id` / `review_event_id` 时状态建议无效。
- 知识点、方法状态变化必须由同一 ID 的证据支持。
- 任一 delta 应用失败时 `pending_state_write = true`。
- Agent 的自然语言判断不能直接进入正式状态。

## 10. 降级

| 失败 | 行为 |
|:---|:---|
| 模型 API 不可用 | 返回结构化 503，不生成假答案 |
| SQLite 未接入 | 可以讲解当前题，但不声称个性化 |
| PgSQL 未接入 | 可以解用户原题，但不伪造题库 ID 或历史题 |
| 召回为空 | 只做已有内容；生成题必须先成功创建 draft |
| 方法标签不确定 | 只按知识点讲解，不做方法迁移 |
| 作答写入失败 | 返回判定反馈并明确状态未保存 |
| delta 应用失败 | 保留 pending，等待重试 |

## 11. 验证

API 测试覆盖：

- QueryPlan 白名单、SQL 字段和 limit；
- StateDelta 证据；
- 每个工具的 Schema 与静态路由；
- 依赖未接时的明确降级；
- 本地 Agent 的计划→教学输出链；
- 数据库端口未接时的降级上下文；
- 模型编造 `question_id` 时拒绝响应。
