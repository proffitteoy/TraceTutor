# SQLite 职责边界

## 应存

- 用户基本学习配置；
- 学习会话；
- 必要对话事实；
- 用户做题记录；
- 当时的题目标签快照；
- 错误类型与错因模式；
- 知识点、方法、题型、结构、解题思想掌握度；
- 掌握度变化事件；
- 复习计划与复习事件；
- Agent 压缩上下文；
- 短期记忆与未闭合任务；
- 当前活动对象；
- Workflow 状态；
- 工具调用日志；
- 待验证状态变化；
- 轻量本地事件日志；
- 系统参数与 schema 版本。

## 不应存

- 完整题库；
- 完整题干、答案和解析；
- 解题步骤资产；
- 知识点和方法的全局定义；
- 题目相似网络；
- embedding；
- 大规模来源文件；
- 未审核题目的全局可召回状态；
- 模型隐藏推理过程；
- 无事实证据的长期掌握判断。

## 跨库引用

```text
SQLite.question_attempt.question_id
    → PgSQL.question_asset.id

SQLite.question_attempt_tag.tag_id
    → PgSQL knowledge_point.id / method_asset.id / 其他资产 ID
```

SQLite 使用 `TEXT` 保存 UUID 字符串。跨数据库引用由 API 层检查，不在 SQLite 中建立外键。

## 事实与判断

| 类型 | 示例 | 表 |
|---|---|---|
| 事实 | 用户提交答案、判错、耗时 180 秒 | `question_attempt` |
| 标签快照 | 当时题目主方法是夹逼估计 | `question_attempt_tag` |
| 当前判断 | 夹逼估计 mastery=0.42 | `mastery_state` |
| 判断历史 | 因一次错误从 0.50 降到 0.41 | `mastery_event` |
| 软记忆 | 用户似乎仍需练习主动构造上下界 | `agent_memory_item` / `context_summary` |

正式状态只能由可验证事实和规则产生。软判断可以进入摘要或短期记忆，但不能直接修改 `mastery_state`。
