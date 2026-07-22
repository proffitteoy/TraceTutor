# API说明

更新日期：2026-04-29

本文档只描述当前仓库里已经存在、且可从代码验证的接口。

## 1. 本地数据接口 `/api/local/*`

### Bootstrap

- `GET /api/local/bootstrap`
- 作用：初始化并返回本地 Profile 与默认工作区

### Workspaces

- `GET /api/local/workspaces`
- `POST /api/local/workspaces`
- `GET /api/local/workspaces/[id]`
- `PUT /api/local/workspaces/[id]`
- `DELETE /api/local/workspaces/[id]`

### Chats

- `GET /api/local/chats?workspace_id=...`
- `POST /api/local/chats`
- `GET /api/local/chats/[id]`
- `PUT /api/local/chats/[id]`
- `DELETE /api/local/chats/[id]`

### Messages

- `GET /api/local/messages?chat_id=...`
- `POST /api/local/messages`
- `DELETE /api/local/messages/delete-from`
- `GET /api/local/messages/[id]`
- `PUT /api/local/messages/[id]`
- `DELETE /api/local/messages/[id]`

### Files

- `GET /api/local/files?workspace_id=...`
- `GET /api/local/files?file_id=...`
- `POST /api/local/files`
- `GET /api/local/files/[id]`
- `PUT /api/local/files/[id]`
- `DELETE /api/local/files/[id]`

### Chat Files / Message File Items

- `GET/POST /api/local/chat-files`
- `GET/POST /api/local/message-file-items`

### Profile

- `GET /api/local/profile`
- `PUT /api/local/profile`

### Chat Summaries

- `GET /api/local/chat-summaries`
- `DELETE /api/local/chat-summaries/[id]`

## 2. 其他本地能力接口

### 知识层（Phase 2 已落地）`/api/knowledge/*`

- `GET /api/knowledge/vaults?workspace_id=...`
  - 列出工作区下已注册的 Vault
- `POST /api/knowledge/vaults`
  - 注册/更新 Vault（`name`, `root_path`, `workspace_id?`）
- `POST /api/knowledge/sync`
  - 对指定 Vault 执行扫描、解析、chunk、link、索引同步
- `POST /api/knowledge/search`
  - 执行 Query Analyzer + Retrieval Router + Rerank，返回候选片段与 citations
- `GET /api/knowledge/notes?note_id=...`
  - 查询 Note 与其 chunks
- `GET /api/knowledge/notes?vault_id=...&path=...`
  - 通过 `vault_id + path` 查询 Note 与 chunks
- `GET /api/knowledge/links?note_id=...`
  - 查询指定 Note 的 outgoing / incoming links
- `POST /api/knowledge/actions`
  - 将对话内容写回 Obsidian `90_AI_Drafts`（支持 `chat_summary` / `concept_note` / `literature_note` / `project_decision_record` / `experiment_log`）

### Chat 编排入口

- `POST /api/chat`
  - 新增 Chat-first 编排入口：`Query Analyzer -> Retrieval Router -> Context Composer -> Citation Builder`
  - 当前阶段返回结构化 `answer + sources + citations`，便于前端渐进披露接入
  - 具体模型流式生成仍保持在 `/api/chat/*` 各 provider 路径

### 记忆检索

- `POST /api/memory/retrieve`
- 检索顺序：
  1. OpenAI / Azure Embedding
  2. 本地 Embedding
  3. 词法回退

### 文件静态读取

- `GET /api/storage/[...path]`
- 从本地 `storage/` 读取文件并按扩展名返回 MIME

### 文件上传/删除辅助接口

- `POST /api/storage/upload`
- `POST /api/storage/delete`

### 总结生成

- `POST /api/summaries/generate`

## 3. 当前没有本地 API 的实体

以下实体当前没有对应 `/api/local/*` 落地接口：

- assistants
- collections
- presets
- prompts
- tools
- models
- folders 写操作

因此这些实体的前端 `db/*` 写操作必须显式报错，而不是伪装成功。

## 4. 接口设计约束

- 本地模式统一通过 `ensureLocalBootstrap()` 兜底用户和默认工作区
- 路由层必须做最小必要的参数校验
- 读取 `storage/` 时必须防止路径穿越
- 文档、实现、`db/*` 包装层必须保持一致
