# 鸢尾花终端

本项目是一个面向本地部署的多模型对话终端，当前聚焦三条主链路：

- 本地工作区与聊天管理
- 文件上传、切片、向量化与检索
- 对话总结与记忆检索

当前实现基于 `Next.js 14 + App Router + Prisma + PostgreSQL + 本地文件存储`。仓库已经从“通用模板 + 占位实现”收敛到“本地优先、能力显式、失败闭合”的维护方式：支持的能力通过本地 API 和 Prisma 落库实现；未落地的能力不会再伪装成成功。

## 当前状态

已完成：

- 本地引导：固定本地用户、Profile、默认工作区自动初始化
- 工作区管理：读取、创建、更新、删除
- 对话管理：读取、创建、更新、删除
- 消息管理：读取、创建、删除区间、单条删除
- 文件管理：上传、存储、本地/远程向量化、文件项写入、文件更新/删除
- 总结管理：列表、详情删除、总结侧边栏展示
- 记忆检索：OpenAI / Azure Embedding、本地 Embedding、词法回退
- Knowledge Vault 注册与管理：`/api/knowledge/vaults`
- Knowledge 同步索引：`/api/knowledge/sync`（Markdown 扫描、frontmatter/tags/links 解析、notes/chunks/links 入库）
- Knowledge 检索编排：`/api/knowledge/search`（analyzer + hybrid + graph expand + rerank）
- Chat 编排入口：`/api/chat`（返回 answer + sources + citations）
- Obsidian 草稿写回：`/api/knowledge/actions`（默认写入 `90_AI_Drafts`）

当前未落地或被显式关闭：

- Assistants
- Collections
- Presets
- Prompts
- Tools
- Models
- Folders 写操作
- 多工作区关系写入（如 file-workspace 关联变更）

详情见 [docs/能力边界.md](./docs/%E8%83%BD%E5%8A%9B%E8%BE%B9%E7%95%8C.md)。

## 目录概览

```text
app/          Next.js 页面与 API 路由
components/   前端组件
context/      全局 React Context
db/           前端数据访问层；应对应真实本地 API 或显式不支持
docs/         仓库文档
lib/          服务端/通用逻辑、Bootstrap、存储、检索、配置
prisma/       Prisma schema
public/       静态资源
storage/      本地文件存储根目录
types/        共享类型
worker/       预留工作线程目录
```

更细的职责划分见 [docs/代码组织.md](./docs/%E4%BB%A3%E7%A0%81%E7%BB%84%E7%BB%87.md) 和 [docs/架构说明.md](./docs/%E6%9E%B6%E6%9E%84%E8%AF%B4%E6%98%8E.md)。

## 快速开始

### 1. 环境要求

- Node.js 18+
- PostgreSQL 14+
- 可选模型 Key：OpenAI、Azure OpenAI、Anthropic、Gemini、DeepSeek 等

### 2. 初始化

```bash
npm install
copy .env.local.example .env.local
npm run db-generate
npm run db-migrate
npm run dev
```

### 3. 核心环境变量

```env
DATABASE_URL=postgresql://user:password@localhost:5432/chatbot_ui?schema=public
LOCAL_STORAGE_PATH=storage
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GEMINI_API_KEY=
DEEPSEEK_API_KEY=
SUMMARY_MODEL=deepseek-chat
```

完整示例见 [.env.local.example](./.env.local.example)。

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run type-check
npm run db-generate
npm run db-migrate
```

## 开发约束

- `db/` 中的函数必须满足二选一：
  - 对应真实 `app/api/local/*` 路由并有可验证行为
  - 显式抛出“不支持”错误，禁止 `null/[]/true` 伪成功
- 新增本地能力时，必须同步更新：
  - Prisma schema
  - `app/api/local/*` 路由
  - `db/*` 数据访问层
  - `docs/API说明.md`
  - `docs/能力边界.md`
- `storage/` 为运行期数据目录，不应作为源码资产管理

更多流程见 [docs/开发指南.md](./docs/%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97.md)。

## 文档导航

- [docs/README.md](./docs/README.md)
- [docs/架构说明.md](./docs/%E6%9E%B6%E6%9E%84%E8%AF%B4%E6%98%8E.md)
- [docs/technical-architecture.md](./docs/technical-architecture.md)
- [docs/二阶段开发任务总框架.md](./docs/%E4%BA%8C%E9%98%B6%E6%AE%B5%E5%BC%80%E5%8F%91%E4%BB%BB%E5%8A%A1%E6%80%BB%E6%A1%86%E6%9E%B6.md)
- [docs/API说明.md](./docs/API%E8%AF%B4%E6%98%8E.md)
- [docs/开发指南.md](./docs/%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97.md)
- [docs/能力边界.md](./docs/%E8%83%BD%E5%8A%9B%E8%BE%B9%E7%95%8C.md)
- [docs/代码审计.md](./docs/%E4%BB%A3%E7%A0%81%E5%AE%A1%E8%AE%A1.md)
