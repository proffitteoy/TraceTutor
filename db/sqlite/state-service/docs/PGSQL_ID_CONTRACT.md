# SQLite 与 PgSQL 的 ID 合同

## 1. 统一格式

PgSQL 使用 UUID 主键；SQLite 使用 `TEXT` 保存同一 UUID 的规范字符串；HTTP/JSON 统一传字符串。

```text
PgSQL.question_asset.id UUID
       ↕ JSON string
SQLite.question_attempt.question_id TEXT
```

不要出现：

- PgSQL UUID，SQLite 自增整数；
- 前端再维护第三套题目 ID；
- 把题目名称当主键；
- 修改 PgSQL ID 后不处理历史引用。

## 2. 字段映射

| SQLite 字段 | PgSQL 目标 |
|---|---|
| `question_attempt.question_id` | `question_asset.id` |
| `conversation_turn.related_question_id` | `question_asset.id` |
| `question_attempt_tag.tag_id` + type=knowledge_point | `knowledge_point.id` |
| `question_attempt_tag.tag_id` + type=method | `method_asset.id` |
| `mastery_state.entity_id` | 对应知识点/方法/结构资产 ID |
| `review_schedule.target_id` | 题目或标签资产 ID |

`thinking_pattern` 可以先只有 `tag_name`，`tag_id` 为空；成熟后再沉淀为 PgSQL 资产。

## 3. 作答标签快照合同

PgSQL 或题目分析服务返回：

```json
{
  "question_id": "uuid",
  "tags": [
    {
      "tag_type": "knowledge_point",
      "tag_id": "uuid",
      "tag_name": "数列极限",
      "role": "primary",
      "weight": 1.0,
      "confidence": 1.0
    }
  ]
}
```

SQLite 保存当时快照。即使 PgSQL 后续重命名或调整关联，历史 mastery event 仍可解释。

## 4. 新题与临时题

用户输入或 AI 生成的新题：

```text
当前会话可使用
    ↓
PgSQL draft / imported / staging
    ↓
审核
    ↓
status=active 后才能正式召回
```

SQLite 的 `source_type` 标记：

- `pgsql`：正式或可引用的 PgSQL 资产；
- `generated_draft`：会话临时题/草稿资产；
- `user_input`：尚未沉淀的新输入。

SQLite 只记录该用户在本次题目上的行为，不决定题目是否进入全局 active 题库。

## 5. API 层校验职责

在正式联调中，写 attempt 前或附加标签前，Tool Gateway 应通过 PgSQL 资产服务检查：

- question 是否存在；
- status 是否允许当前场景使用；
- tag ID 与 tag type 是否匹配；
- 标签是否属于该题；
- 未审核题是否仅限当前 session。

本仓库提供三种校验模式：

```text
TRACE_TUTOR_ASSET_VALIDATION_MODE=off     # 独立本地演示，仅检查非空
TRACE_TUTOR_ASSET_VALIDATION_MODE=format  # 检查 UUID 字符串格式
TRACE_TUTOR_ASSET_VALIDATION_MODE=http    # 调 PgSQL 资产服务 /validate-reference
```

正式联调建议使用 `http`。题目—标签归属、资产状态与会话草稿权限由 PgSQL 资产服务判定；SQLite 保存验证后的引用和当时快照。
