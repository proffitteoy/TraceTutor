# Iris 前端

`apps/iris` 是当前 TraceTutor 一键启动链路使用的数学做题工作台。它通过公开 API 读取
已批准题目目录，并通过 `/agent/chat` 完成判题、提示和追问；不包含 Prisma、本地知识库、
文件检索或数据库直连能力。

## 当前能力

- Next.js 16 + React 19 + TypeScript。
- 从已批准题库按学科浏览、搜索并选择真实题目。
- 在题目内读取该用户保存在 SQLite 的历史作答；新建对话只清空当前对话，不删除本题历史。
- “新建对话”立即打开无题也可使用的独立对话窗；之后选择题目会把题目加入当前对话，不会清空已有消息。
- 判题、方法、学习状态和后续动作统一显示在中间对话流，不再设置重复且容易挤压公式的右侧反馈栏。
- 顶部 Iris 状态来自真实 `/health/ready`，服务降级时禁用提交，不再仅因配置了 API 地址就显示“已连接”。
- 在同一工作台中提交答案、请求提示或继续追问。
- 提交答案时显式携带当前真实 `question_id`，前端不自行判题。
- 解题步骤、方法诊断、变式题、旧题回顾和状态写回卡片。
- 浏览器生成并保存稳定的 `user_id` 与会话级 `session_id`，不再使用固定预览身份。
- 对 `LearningResponse` 做 Zod 运行时校验，拒绝不符合契约的网关响应。
- 右侧反馈栏只在真实 Agent 响应后出现，集中展示判题结论、关键方法、学习记录和下一步动作。

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
GET  {NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL}/questions/practice
GET  {NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL}/questions/{questionId}/attempts?user_id={userId}
POST {NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL}/agent/chat
```

未配置网关时，页面保持可打开但禁用发送，并明确提示配置缺失；不会用 Demo、Mock 或本地规则伪造教学结果。禁止把模型 API Key、工具 Bearer Token、数据库口令或其他密钥放进 `NEXT_PUBLIC_*`。

## 契约

请求与响应定义在 `lib/contracts.ts`：

- `LearningRequest` 只携带用户任务、会话身份、附件引用和当前题目引用。
- `LearningResponse` 只携带 Iris 可渲染的卡片、动作与写回状态。
- `PracticeQuestion` 只包含做题所需的题目 ID、题干、学科、题型和难度，不包含答案或解析。
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
