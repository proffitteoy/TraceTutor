# 人工精标题库检查点

本目录保存当前模型逐题独立解答、标注并经用户确认的首批考研真题。当前检查点停在 **哈尔滨工业大学 2026 年数学分析**；后续工作暂不继续。

## 当前进度

- 已完成：7 套试卷、66 道原子题；
- 完成范围：
  - 北京师范大学 2026 高等代数；
  - 北京师范大学 2026 解析几何；
  - 复旦大学 2025 数学分析；
  - 复旦大学 2025 高等代数；
  - 复旦大学 2026 数学分析；
  - 哈尔滨工业大学 2026 高等代数；
  - 哈尔滨工业大学 2026 数学分析；
- 当前无进行中的试卷；
- 下次建议从 `E:\考研真题\MinerU_markdown_湖南大学2024_2082766457060495360.md` 继续；
- 完整机器可读进度见 `progress.json`。

## 审批与状态

用户已明确批准当前 66 题准备入库。题目 JSON 和 JSONL 中仍保留 `status = imported`，这是 `questionJsonlSchema` 的强制契约，不代表审批尚未完成。

PgSQL 接入后应按以下顺序执行：

1. 导入 JSONL，生成真实 `question_id` 和 `review_item_id`；
2. 按 `external_id` 与审批清单对账；
3. 通过 `QuestionIngestionPort.applyReview` 执行 `approve`；
4. 由 PgSQL 事务写审核日志并把题目切换为 `active`。

不得直接改 JSONL 为 `active`，也不得绕过审核事务更新数据库。

## 入库文件

- `approved-initial-batch-2026-07-30.jsonl`：一行一道题，供现有 `questions:import` CLI 使用；
- `approved-initial-batch-2026-07-30.manifest.json`：批次键、哈希、行号范围、审批重放说明与 OCR 风险项；
- `tag-dictionary.json`：人工可读稳定标签 code；数据库 UUID 仍由 PgSQL 生成；
- `prepare-ingestion-batch.mjs`：从 `progress.json` 中列出的已完成集合重新生成并校验入库批次。

重新生成批次：

```powershell
node db\pgsql\question-bank\prepare-ingestion-batch.mjs
```

在不连接 PgSQL、不调用模型 API 的情况下校验 66 行 JSONL：

```powershell
cd apps\api
npm run questions:validate -- `
  --file ..\..\db\pgsql\question-bank\approved-initial-batch-2026-07-30.jsonl
```

PgSQL 适配器接通后，从 `apps/api` 执行：

```powershell
npm run questions:import -- `
  --file ..\..\db\pgsql\question-bank\approved-initial-batch-2026-07-30.jsonl `
  --batch-name "TraceTutor 首批人工精标考研真题" `
  --batch-key "<manifest 中的 batch_key>"
```

当前 PgSQL 仍由数据库协作者实现，因此本检查点只完成可复现的文件级入库准备，没有声称题目已经写入数据库或已在数据库中切换为 `active`。
