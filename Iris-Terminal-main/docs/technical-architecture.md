# Iris-Terminal Knowledge Agent 技术架构设计

更新日期：2026-04-29

阶段定位：二阶段开发任务

数据库选型：`PostgreSQL (pgsql) + pgvector + PostgreSQL full-text search`

## 1. 系统定位

Iris-Terminal 的核心形态不是传统知识库软件，而是一个 **Chat-first、Obsidian-aware、local-first 的长期知识工作台**。

系统以多模型对话为主入口，以 Obsidian Vault、文件资料、项目记忆、历史对话总结作为增强上下文来源。知识库不直接替代 Obsidian，也不要求用户在 Iris-Terminal 内重新维护笔记，而是通过同步、索引、检索、引用和写回机制，让 Chat 能够稳定使用用户已有知识。

核心原则：

```text
Chat 是主界面。
Obsidian 是人类知识源。
PostgreSQL 是机器检索与状态中心。
LLM 是推理、组织、表达层。
Retrieval Router 是上下文调度层。
Progressive Disclosure UI 是证据披露层。
```

## 2. 总体架构

```text
┌───────────────────────────────────────────────────────────┐
│                         Frontend                          │
│                                                           │
│  Chat UI  │ Source Drawer │ Note Preview │ Vault Status    │
└──────────────────────────────┬────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────┐
│                    API / Application Layer                 │
│                                                           │
│  Chat API │ Knowledge API │ Vault Sync API │ Note Action API │
└──────────────────────────────┬────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────┐
│                      Agent Orchestration                   │
│                                                           │
│  Query Analyzer                                            │
│  Retrieval Router                                          │
│  Context Composer                                          │
│  Citation Builder                                          │
│  Note Action Planner                                       │
└──────────────────────────────┬────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────┐
│                     Knowledge Runtime Layer                │
│                                                           │
│  PostgreSQL                                                │
│  pgvector                                                  │
│  full-text index                                           │
│  note graph                                                │
│  retrieval logs                                            │
└──────────────────────────────┬────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────┐
│                      Knowledge Sources                     │
│                                                           │
│  Obsidian Vault │ uploaded files │ chat summaries │ projects │
└───────────────────────────────────────────────────────────┘
```

## 3. 分层设计

### 3.1 前端展示层

前端仍然以 Chat 为核心，不把知识库管理放到主舞台。

主要组件：

```text
components/chat/
  ChatWindow.tsx
  MessageList.tsx
  MessageComposer.tsx
  ModelSelector.tsx
  ChatModeSelector.tsx

components/knowledge/
  SourceChips.tsx
  SourceDrawer.tsx
  SourceCard.tsx
  NotePreview.tsx
  VaultStatus.tsx
  KnowledgeGraphMini.tsx
  SaveToObsidianDialog.tsx
  RetrievalDebugPanel.tsx
```

推荐 UI 结构：

```text
┌────────────────────────────────────────────────────────────┐
│ Top Bar: Workspace / Model / Mode / Vault Status           │
├───────────────┬─────────────────────────────┬──────────────┤
│ Sidebar       │ Chat Main                   │ Source Pane   │
│               │                             │              │
│ Workspaces    │ User / Assistant messages   │ Sources       │
│ Chats         │ Composer                    │ Note Preview  │
│ Recent Notes  │                             │ Graph Mini    │
│ Vault Status  │                             │ Debug         │
└───────────────┴─────────────────────────────┴──────────────┘
```

默认状态下，右侧 `Source Pane` 不展开。只有当回答使用了知识库检索结果时，回答下方显示来源胶囊：

```text
Sources: 4 notes used
[泛函分析-弱收敛] [TDA-传播结构] [量化-stage3] [科研写作规范]
```

点击后再展开来源、原文、关联笔记和调试信息。这就是渐进式披露。

### 3.2 应用 API 层

建议新增 API 路由：

```text
app/api/knowledge/vaults/route.ts
app/api/knowledge/sync/route.ts
app/api/knowledge/search/route.ts
app/api/knowledge/notes/route.ts
app/api/knowledge/links/route.ts
app/api/knowledge/actions/route.ts
app/api/chat/route.ts
```

职责划分：

```text
/api/knowledge/vaults
管理 vault 注册信息，例如 vault name、root path、workspace 绑定关系。

/api/knowledge/sync
执行 vault 扫描、增量同步、hash 检测、chunk 更新、embedding 更新。

/api/knowledge/search
提供向量检索、全文检索、混合检索、图谱扩展检索。

/api/knowledge/notes
读取 note metadata、chunk、引用片段、heading 结构。

/api/knowledge/links
读取 Obsidian 双链、backlinks、forward links、tag relations。

/api/knowledge/actions
保存回答到 Obsidian 草稿、生成 literature note、生成 project log。

/api/chat
主对话接口，内部调用 retrieval router 和 context composer。
```

### 3.3 Agent 编排层

Agent 编排层不要一开始做成复杂多 Agent 系统。第一版建议做成清晰的 pipeline。

```text
User Message
    ↓
Query Analyzer
    ↓
Retrieval Decision
    ↓
Retrieval Router
    ↓
Rerank / Filter
    ↓
Context Composer
    ↓
LLM Gateway
    ↓
Citation Builder
    ↓
Response + Source Metadata
```

核心模块建议放在：

```text
lib/agent/
  phase2-framework.ts
  phase2/
    contracts.ts
    pipeline.ts
    stages/*
  query-analyzer.ts
  retrieval-router.ts
  context-composer.ts
  citation-builder.ts
  note-action-planner.ts

lib/knowledge/
  vault-scanner.ts
  markdown-parser.ts
  frontmatter-parser.ts
  link-extractor.ts
  note-chunker.ts
  note-indexer.ts
  hybrid-search.ts
  graph-expander.ts
  reranker.ts

lib/llm/
  llm-gateway.ts
  embedding-provider.ts
  prompt-builder.ts
```

## 4. Chat 模式设计

建议提供三种 Chat 模式。

```text
Auto
默认模式。系统自动判断是否需要检索知识库。

Chat Only
纯对话模式，不查 Obsidian，不查文件，不查历史知识。

Grounded
强制知识库增强模式。回答必须基于召回内容；查不到就明确说明查不到。
```

模式逻辑：

```text
Auto:
  - 数学推导、代码解释、通用问题：不检索
  - 提到“我的笔记”“之前项目”“某篇论文”“Obsidian 里”：检索
  - 提到项目名、文件名、内部术语：检索
  - 不确定时轻量检索，但限制 top-k

Chat Only:
  - 禁用 retrieval router
  - 只使用当前对话上下文

Grounded:
  - 强制 retrieval router
  - 回答必须携带 sources
  - 没有可靠来源时拒绝编造
```

## 5. 知识同步架构

Obsidian 不直接暴露给 LLM，而是先同步为结构化索引。

```text
Obsidian Vault
    ↓
Vault Scanner
    ↓
Markdown Parser
    ↓
Frontmatter / Links / Headings Extractor
    ↓
Chunker
    ↓
Embedding Generator
    ↓
PostgreSQL + pgvector + full-text index
```

同步策略：

```text
1. 首次全量扫描
读取所有 .md 文件，建立 Note / NoteChunk / NoteLink。

2. 后续增量同步
根据 path、mtime、content_hash 判断是否需要更新。

3. 删除检测
如果 vault 中文件已删除，则标记 note 为 deleted，而不是立刻物理删除。

4. embedding 更新
只有 chunk content_hash 变化时才重新生成 embedding。

5. link graph 更新
每次 note 内容变化后重新解析 [[links]]、#tags、aliases、heading links。
```

## 6. 数据模型设计

建议新增如下核心表。

### 6.1 Vault

```prisma
model Vault {
  id           String   @id @default(uuid()) @db.Uuid
  workspace_id String?  @db.Uuid
  name         String
  root_path    String
  status       String   @default("active")
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  notes        Note[]
}
```

### 6.2 Note

```prisma
model Note {
  id            String   @id @default(uuid()) @db.Uuid
  vault_id      String   @db.Uuid
  path          String
  title         String
  aliases       String[]
  tags          String[]
  frontmatter   Json?
  content_hash  String
  mtime         DateTime
  status        String   @default("active")
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  vault         Vault       @relation(fields: [vault_id], references: [id])
  chunks        NoteChunk[]
  outgoingLinks NoteLink[]  @relation("OutgoingLinks")

  @@unique([vault_id, path])
}
```

### 6.3 NoteChunk

```prisma
model NoteChunk {
  id               String   @id @default(uuid()) @db.Uuid
  note_id          String   @db.Uuid
  heading_path     String[]
  block_id         String?
  content          String
  content_hash     String
  token_count      Int
  start_line       Int?
  end_line         Int?
  local_embedding  Json?
  openai_embedding Json?
  tsv              Unsupported("tsvector")?
  created_at       DateTime @default(now())
  updated_at       DateTime @updatedAt

  note             Note     @relation(fields: [note_id], references: [id])
}
```

实际如果使用 `pgvector`，embedding 字段建议后续改为：

```prisma
embedding Unsupported("vector(1536)")?
```

或者根据本地 embedding 模型维度设定为：

```prisma
embedding Unsupported("vector(384)")?
```

### 6.4 NoteLink

```prisma
model NoteLink {
  id              String   @id @default(uuid()) @db.Uuid
  vault_id        String   @db.Uuid
  source_note_id  String   @db.Uuid
  target_note_id  String?  @db.Uuid
  target_path     String
  link_text       String?
  link_type       String   // wiki, markdown, heading, block
  created_at      DateTime @default(now())

  source_note     Note     @relation("OutgoingLinks", fields: [source_note_id], references: [id])
}
```

### 6.5 RetrievalEvent

```prisma
model RetrievalEvent {
  id              String   @id @default(uuid()) @db.Uuid
  chat_id         String?  @db.Uuid
  message_id      String?  @db.Uuid
  query           String
  mode            String
  strategy        String
  recalled_items  Json
  final_context   Json?
  created_at      DateTime @default(now())
}
```

这个表非常重要。它用于调试每次回答：

```text
查了什么？
为什么查？
召回了哪些 chunk？
分数是多少？
哪些 chunk 最终进入 LLM 上下文？
回答引用了哪些来源？
```

没有这个表，RAG 系统后期很难调优。

## 7. 检索架构

不能只做向量检索。建议采用混合检索。

```text
User Query
    ↓
Query Analyzer
    ↓
Hybrid Retrieval
    ├─ Full-text search
    ├─ Vector search
    ├─ Metadata filter
    ├─ Graph expansion
    └─ Chat memory search
    ↓
Candidate Chunks
    ↓
Rerank
    ↓
Context Selection
    ↓
LLM Context
```

### 7.1 全文检索

适合：

```text
项目名
论文名
公式名
人名
文件名
代码名
具体术语
```

例如：

```text
TP_H1
Cliff's delta
Bubenik 2015
Stage3 v3
弱收敛
Riesz 表示定理
```

### 7.2 向量检索

适合：

```text
语义相似问题
模糊问题
概念解释
跨笔记关联
```

例如：

```text
“之前我们讨论过谣言传播结构那个结论是什么？”
“我对 CatBoost 在量化里的作用怎么看？”
“泛函分析里弱收敛为什么重要？”
```

### 7.3 图谱扩展

利用 Obsidian 的 `[[links]]`、backlinks、tags、aliases 做二次扩展。

```text
初始召回 Note A
    ↓
找 Note A 的 backlinks
找 Note A 的 forward links
找同 tag 的 Note
找 aliases 匹配的 Note
    ↓
加入候选集合
```

图谱扩展不应该无限展开。建议限制：

```text
depth <= 1
extra notes <= 5
extra chunks <= 8
```

### 7.4 检索打分

候选 chunk 可以统一打分：

```text
final_score =
  0.45 * vector_score
+ 0.30 * fulltext_score
+ 0.15 * graph_score
+ 0.10 * recency_score
```

具体权重可以后续在实验中调整。

## 8. 上下文组装

LLM 不直接接触整个知识库，而是接收一个经过筛选的上下文包。

```text
Context Packet
├─ system prompt
├─ user profile
├─ workspace instructions
├─ recent chat messages
├─ chat summaries
├─ retrieved notes
├─ retrieved files
├─ source metadata
└─ citation rules
```

建议格式：

```text
[Workspace Context]
workspace_name: ...
workspace_instruction: ...

[User Memory]
...

[Retrieved Notes]
<source id="note_1_chunk_3" title="..." path="..." lines="12-28">
...
</source>

<source id="note_2_chunk_1" title="..." path="..." lines="5-19">
...
</source>

[Current Conversation]
user: ...
```

回答时要求模型遵守：

```text
1. 如果使用 retrieved notes，必须返回 source ids。
2. 如果知识库中没有证据，不要伪造来源。
3. 普通知识可以直接回答，但 Grounded 模式下必须基于来源。
4. 旧结论和新结论冲突时，优先使用 updated_at 更新的内容，并指出冲突。
```

## 9. 渐进式披露设计

渐进式披露分五层。

### 第一层：直接回答

只展示答案，不展示检索过程。

```text
你的问题核心在于……
```

### 第二层：来源胶囊

回答下方展示：

```text
Sources: 3 notes used
[Note A] [Note B] [Note C]
```

### 第三层：来源抽屉

点击来源后显示：

```text
标题
路径
更新时间
命中片段
上下文
引用位置
打开 Obsidian
```

### 第四层：关联网络

进一步展示：

```text
Backlinks
Forward links
Same tags
Related notes
```

### 第五层：调试信息

高级模式展示：

```text
query rewrite
retrieval strategy
vector score
full-text score
rerank score
chunk id
token count
context budget
```

这套设计可以同时满足普通聊天体验和研究级可追溯性。

## 10. 写回 Obsidian 机制

AI 不应该直接修改正式笔记。建议默认写入草稿区。

```text
Obsidian Vault
├─ 00_Inbox
├─ 10_Projects
├─ 20_Literature
├─ 30_Math
├─ 40_Experiments
└─ 90_AI_Drafts
```

写回类型：

```text
Chat Summary
把一次对话总结为项目日志。

Concept Note
把一次解释转为概念笔记。

Literature Note
把论文阅读内容转为文献笔记。

Project Decision Record
把项目中的技术决策写成 ADR。

Experiment Log
把实验结论写成实验记录。
```

草稿 frontmatter 示例：

```markdown
---
source: iris-terminal
type: ai-draft
status: draft
created: 2026-04-29
workspace: knowledge-agent
related:
  - "[[Obsidian]]"
  - "[[RAG]]"
  - "[[Iris-Terminal]]"
tags:
  - ai-draft
  - knowledge-agent
---

# 标题

## 摘要

## 正文

## 来源

## 待人工确认
```

原则：

```text
AI 默认只写 90_AI_Drafts。
用户确认后再移动到正式目录。
正式笔记不自动覆盖。
每次写回保留来源和生成时间。
```

## 11. 推荐目录结构

建议在现有项目中新增：

```text
lib/
  agent/
    query-analyzer.ts
    retrieval-router.ts
    context-composer.ts
    citation-builder.ts
    note-action-planner.ts

  knowledge/
    vault-scanner.ts
    markdown-parser.ts
    frontmatter-parser.ts
    link-extractor.ts
    note-chunker.ts
    note-indexer.ts
    hybrid-search.ts
    graph-expander.ts
    reranker.ts
    retrieval-logger.ts

  obsidian/
    vault-path.ts
    obsidian-uri.ts
    note-writer.ts
    draft-writer.ts

  llm/
    llm-gateway.ts
    embedding-provider.ts
    prompt-builder.ts

components/
  knowledge/
    VaultStatus.tsx
    SourceChips.tsx
    SourceDrawer.tsx
    SourceCard.tsx
    NotePreview.tsx
    KnowledgeGraphMini.tsx
    SaveToObsidianDialog.tsx
    RetrievalDebugPanel.tsx

app/api/knowledge/
  vaults/route.ts
  sync/route.ts
  search/route.ts
  notes/route.ts
  links/route.ts
  actions/route.ts
```

## 12. 关键技术选型

推荐技术栈：

```text
Frontend:
Next.js
React
TypeScript
Tailwind CSS
Radix UI

Backend:
Next.js Route Handlers
Node.js
Prisma

Database:
PostgreSQL
pgvector
PostgreSQL full-text search

Knowledge Source:
Obsidian Vault
Markdown
YAML frontmatter
Wiki links

LLM:
OpenAI-compatible API
DeepSeek / Qwen / local model gateway
local embedding fallback

Storage:
local filesystem
storage/
Obsidian vault path
```

不建议第一版引入太多东西，例如：

```text
不要一开始上 Neo4j。
不要一开始做复杂多 Agent。
不要一开始做实时双向同步。
不要一开始做全局知识图谱大屏。
不要一开始做自动改写正式笔记。
```

第一版应以可控、稳定、可调试为主。

## 13. MVP 迭代路线

### Phase 1：Vault 同步与索引

目标：让 Obsidian 内容进入 PostgreSQL。

功能：

```text
注册 vault path
扫描 .md 文件
解析 frontmatter
解析 tags / aliases / links
按 heading chunk
生成 embedding
建立全文索引
```

验收标准：

```text
可以在 Iris-Terminal 中搜索 Obsidian note。
可以看到 note path、title、tags、chunks。
文件变更后可以重新同步。
```

### Phase 2：Grounded Chat

目标：Chat 可以基于 Obsidian 回答。

功能：

```text
新增 Grounded 模式
用户提问后执行 hybrid retrieval
把 top chunks 送入 LLM
回答附带 sources
前端展示 SourceChips 和 SourceDrawer
```

验收标准：

```text
回答能引用 Obsidian 笔记。
点击来源能看到原文片段。
查不到时不会编造。
```

### Phase 3：Auto Retrieval

目标：让系统自动判断是否需要查知识库。

功能：

```text
Query Analyzer 判断问题类型
普通问题不查
项目/笔记/历史相关问题自动查
支持 workspace 级过滤
记录 RetrievalEvent
```

验收标准：

```text
普通数学问题响应速度不被 RAG 拖慢。
涉及用户项目的问题能自动召回相关笔记。
可以在 DebugPanel 查看检索过程。
```

### Phase 4：Obsidian 写回

目标：把 Chat 结果沉淀回知识库。

功能：

```text
Save as AI Draft
Save as Concept Note
Save as Project Log
Save as Literature Note
Save as Experiment Log
```

验收标准：

```text
AI 只能默认写入 90_AI_Drafts。
草稿带 frontmatter。
草稿保留来源。
用户可打开 Obsidian 查看。
```

### Phase 5：知识图谱增强

目标：利用 Obsidian 链接关系增强检索和展示。

功能：

```text
backlinks
forward links
same tags
related notes
graph mini view
graph expansion retrieval
```

验收标准：

```text
检索结果可以通过双链扩展。
SourceDrawer 中能展示相关笔记。
图谱只作为辅助，不干扰 Chat 主流程。
```

## 14. 核心闭环

最终系统应该形成这个闭环：

```text
用户在 Obsidian 中积累笔记
        ↓
Iris-Terminal 同步并索引
        ↓
用户在 Chat 中提出问题
        ↓
系统判断是否需要知识库增强
        ↓
检索 Obsidian / 文件 / 历史记忆
        ↓
LLM 基于上下文回答
        ↓
前端渐进披露来源
        ↓
用户将有价值内容写回 Obsidian 草稿
        ↓
人工整理后成为新的长期知识
```

这个闭环比单纯 RAG 更重要。它让系统从“能查资料的聊天框”升级为“能积累、调用、沉淀知识的长期工作台”。

## 15. 架构结论

推荐最终架构一句话概括：

```text
Iris-Terminal 采用 Chat-first 架构，以 Obsidian Vault 作为人类知识源，通过 PostgreSQL、pgvector、全文索引和双链图谱构建运行时知识索引；系统在对话过程中由 Retrieval Router 判断是否需要知识增强，由 Context Composer 生成可控上下文包交给 LLM，并通过渐进式披露界面展示来源、原文、关联笔记与调试信息，最终支持将高价值对话内容以草稿形式写回 Obsidian。
```

这版架构的重点不是“让 LLM 读 Obsidian”，而是建立一个稳定的中间层：

```text
Obsidian 负责知识沉淀。
PostgreSQL 负责知识调度。
LLM 负责知识使用。
前端负责渐进披露。
```

这样做更稳，也更适合后续把它扩展成科研、学习、项目管理一体化的长期智能体。

---

## 16. 当前落地状态（2026-04-29）

本架构在仓库中的二阶段落地范围：

1. 数据层：
   - 已新增 Prisma 模型：`Vault / Note / NoteChunk / NoteLink / RetrievalEvent`
   - 已新增迁移：`prisma/migrations/20260429153000_knowledge_runtime/migration.sql`
2. 服务层：
   - 已新增 `app/api/knowledge/*`：`vaults / sync / search / notes / links / actions`
   - 已新增 `app/api/chat/route.ts` 编排入口（Analyzer -> Retrieval -> Context -> Citation）
3. 编排与运行时：
   - 已新增 `lib/agent/*`、`lib/knowledge/*`、`lib/obsidian/*`、`lib/llm/*` 最小可运行骨架
4. 边界说明：
   - 当前 `/api/chat` 以“检索编排与来源回传”为主，provider 流式统一入口待下一阶段并入
   - `pgvector` 字段与索引已预留，在线 embedding 写入/召回策略待下一阶段补齐
