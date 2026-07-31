# 安全与数据保护

## 1. 内部 service token

本服务使用环境变量：

```bash
TRACE_TUTOR_SQLITE_SERVICE_TOKEN=<long-random-secret>
```

生产环境缺少或 token 少于 16 个字符时拒绝启动。受保护请求必须携带：

```http
Authorization: Bearer <long-random-secret>
```

该 token 只在 `apps/api` 与本服务之间共享，不是最终用户身份凭据。内部 ToolExecutionPort 还会核对请求上下文与输入中的 `user_id`、`session_id`。

## 2. 用户作用域完整性

migration 005 建立触发器，防止：

- 用户 A 的 attempt 绑定用户 B 的 session；
- 工具日志绑定其他用户的 Workflow；
- pending delta 使用其他用户的 attempt/review/workflow 证据；
- review_event 绑定其他用户的 schedule；
- review_event 的 target 与 schedule 不一致；
- mastery_event 绑定其他用户的 mastery/attempt/review；
- context/runtime/review 绑定其他用户的 session。

触发器是数据库最后一道防线；API 层仍应做授权检查。

## 3. Agent 权限

Agent 只能调用固定 operationId。禁止：

- `execute_sql`；
- 直接更新 `mastery_state`；
- 未经校验写入复习计划；
- 查询与当前用户无关的数据；
- 将完整题库或用户历史放入 Prompt。

## 4. 日志最小化

`tool_call_log.output_summary_json` 只保存摘要。不要在日志中保存：

- 密码、API key、service token；
- 真实姓名、联系方式；
- 完整大模型 Prompt；
- 大段题库资产；
- 模型隐藏推理；
- 不必要的用户隐私信息。

## 5. GitHub

`.gitignore` 已排除 SQLite 文件、WAL、SHM、`.env` 和虚拟环境。提交前仍应运行：

```bash
git status --short
```

确认没有真实用户数据。


## 6. 跨库引用验证

正式环境使用 `TRACE_TUTOR_ASSET_VALIDATION_MODE=http`，由 PgSQL 资产服务确认 question/tag 引用存在且允许当前场景使用。`format` 只验证 UUID 格式，`off` 只用于独立演示。

## 7. 状态写回安全范围

`pending_state_delta` 校验允许字段、事实证据、目标引用、Workflow 状态和单次 mastery/confidence/priority 最大变化。Agent 提交的自由数值不会直接执行。
