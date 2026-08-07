# PgSQL 题目资产库

本目录保存题目、答案、解析步骤、知识点、方法、相似关系、导入 staging
和质量审核；不得保存用户作答、掌握度或复习计划。

## 已落地能力

- `migrations/`：7 个正式迁移，包含导入幂等、持续 active 质量约束、
  引用完整性、最小权限角色和安全 `search_path`。
- `apps/api/src/adapters/pgsql.ts`：8 个参数化 `asset.*` 工具以及完整
  `QuestionIngestionPort`。
- API 使用组合端口把 PgSQL 的 8 个资产工具与 SQLite 的 7 个状态工具
  合并为完整的 15 工具边界，不暴露任意 SQL。
- `question-bank/`：66 道已批准初始化题、批准 manifest、标签字典和续作检查点。
- `seeds/002_development_questions.sql`：仅用于开发自检的 12 道样题，
  不是正式题库。

## 目录

```text
db/pgsql/
├── migrations/        # 按文件名顺序执行
├── seeds/             # 参考数据与开发验证题
├── queries/           # 维护者参考查询；运行时不读取
├── tests/             # 数据库自检
├── examples/          # JSONL 格式示例
├── question-bank/     # 正式初始化输入与批准证据
└── README.md
```

空库先按文件名执行 `migrations/*.sql`。开发环境可再执行两个 seed，并运行
`tests/database_self_test.sql`；生产初始化不要执行开发题 seed。

## 导入已批准的 66 道初始化题

API 配置 `TRACE_TUTOR_PGSQL_URL` 并启动后执行：

```powershell
Set-Location apps/api
npm run questions:import -- --file ../../db/pgsql/question-bank/approved-initial-batch-2026-07-30.jsonl --batch-name "TraceTutor 首批人工精标考研真题" --batch-key tracetutor-curated-15ab68105feb44acc3f89caa --activate-approved-manifest ../../db/pgsql/question-bank/approved-initial-batch-2026-07-30.manifest.json
```

命令会先校验 JSONL SHA-256 和批准清单，再生成真实 `question_id` /
`review_item_id`，按 `external_id` 对账，写入 approved 审核记录并切换为
`active`。JSONL 保持 `status=imported`，因为它是可重放输入而非数据库现态。

## 不变量

- 普通导入题先进入 `imported`；用户新题和 AI 变式题在单一事务内先以 `draft` 组装完整资产，写入自动批准证据后立即切换为 `active`，不会把半成品暴露给召回。
- 只有最新审核为 approved 且具备主答案、主解析、解析步骤、主知识点和主方法
  的题目可成为 `active`。
- active 后删除或破坏上述资产、修改核心题干、回退状态都会被数据库拒绝。
- 所有正式召回只读取 `active AND is_public`。
- `batch_key` 与 `(batch_id, line_number)` 保证重放幂等。
