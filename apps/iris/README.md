# Iris 前端

`apps/iris` 是面向 TraceTutor `/agent/chat` 契约的轻量集成客户端。它复用正式前端
`Iris-Terminal-main` 的品牌素材和终端式交互语言，但不替代正式前端，也不包含正式前端的
Prisma、本地知识库、文件检索和多模型能力。

## 当前能力

- Next.js 16 + React 19 + TypeScript。
- 新题解析、复习调度、自由追问三种输入模式。
- 对话与卡片树画布双视图；支持深入子卡片、同级发散卡片和历史分支卡片。
- 可在单条 Agent 回答中框选文本并右键使用 Ask 创建引用式深入卡片。
- 卡片位置、分支关系和各分支对话保存在浏览器本地，刷新后可恢复；它们不是数据库学习状态。
- 解题步骤、方法诊断、变式题、旧题回顾和状态写回卡片。
- 浏览器生成并保存稳定的 `user_id` 与会话级 `session_id`，不再使用固定预览身份。
- 对 `LearningResponse` 做 Zod 运行时校验，拒绝不符合契约的网关响应。
- 响应式三栏学习终端，右栏只展示真实 Agent 响应，不伪造掌握度。

Iris 不包含 Prisma、数据库访问、LLM SDK、Agent 密钥或本地知识库逻辑。

## 本地运行

要求 Node.js 20 或兼容版本。在本目录执行：

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

默认访问 `http://localhost:3000`。可用检查命令：

```powershell
npm run type-check
npm run build
```

## 网关配置

`.env.local` 只配置公开 API 地址：

```text
NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL=http://localhost:4100
```

前端只调用：

```text
POST {NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL}/agent/chat
```

未配置网关时，页面保持可打开但禁用发送，并明确提示配置缺失；不会用 Demo、Mock 或本地规则伪造教学结果。禁止把模型 API Key、工具 Bearer Token、数据库口令或其他密钥放进 `NEXT_PUBLIC_*`。

## 契约

请求与响应定义在 `lib/contracts.ts`：

- `LearningRequest` 只携带用户任务、会话身份、附件引用和当前题目引用。
- `LearningResponse` 只携带 Iris 可渲染的卡片、动作与写回状态。
- 前端不发送 SQL、题库过滤实现或掌握度变化。
- `state_change` 只展示 API/Agent 返回的 `pending`、`applied` 或 `rejected`。

## 目录

```text
apps/iris/
├── app/                 # 页面、布局和全局视觉样式
├── components/          # 纯前端交互与卡片渲染
│   └── learning-tree-canvas.tsx # 卡片树画布与分支操作
├── lib/
│   ├── contracts.ts     # Iris 与教学网关的类型和运行时 Schema
│   ├── gateway.ts       # 网关配置选择
│   ├── learning-tree.ts # 浏览器端卡片树状态与持久化契约
│   └── gateways/        # HTTP 网关适配器
└── public/branding/     # 从正式鸢尾花终端复用的品牌素材
```

## 边界

- 前端不直接访问 PgSQL 或 SQLite。
- 卡片树的浏览器持久化只保存 UI 工作区，不声明掌握度、复习结果或数据库写回成功。
- 前端不自行推断知识点、方法、掌握度或复习时间。
- 正式状态写回必须由 API 规则层校验证据后完成。
- 数据库字段变化应由网关契约吸收，不能直接传播到组件。
