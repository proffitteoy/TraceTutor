# 扣子 Agent 目录

这里放扣子侧的 Prompt、Workflow、工具清单和导出配置。

建议内容：

- 主 Agent 与子 Agent 的 Prompt 分层
- Workflow 编排说明
- 工具 schema
- 输出 JSON schema
- 导出物说明或截图

职责边界：

- 负责意图理解、工作流调度、教学输出组织
- 不直接访问数据库
- 不直接执行 SQL
- 所有状态写回都应通过 API 工具完成
