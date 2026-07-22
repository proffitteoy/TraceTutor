# Iris 前端

`apps/iris` 是 TraceTutor 的前端交互层，基于原有 `Iris-Terminal-main` 的品牌素材和终端式交互语言重新收敛而来。

## 当前能力

- Next.js 16 + React 19 + TypeScript 独立前端
- 新题解析、复习调度、自由追问三种输入模式
- 解题步骤、方法诊断、变式题、旧题回顾和待写回状态卡片
- 响应式三栏学习终端
- 类型化 `IrisGateway`，可在演示适配器和真实 HTTP 网关之间切换

当前没有迁入旧项目的 Prisma、数据库访问、LLM SDK、内置 API 路由和本地知识库逻辑。这样可以保证 Iris 不直接依赖 PgSQL 或 SQLite 的实现。

## 本地运行

要求 Node.js 20 或兼容版本。在本目录执行：

```powershell
npm install
npm run dev
```

默认访问 `http://localhost:3000`。未配置网关时，页面使用浏览器内的演示适配器，不读取或写入数据库。

可用检查命令：

```powershell
npm run type-check
npm run build
```

## 接入真实网关

复制 `.env.example` 为 `.env.local`，配置：

```text
NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL=https://your-gateway.example.com
```

前端只会调用：

```text
POST {NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL}/agent/chat
```

请求与响应类型定义在 `lib/contracts.ts`。网关地址是公开配置，禁止把扣子令牌、数据库口令或其他密钥放进 `NEXT_PUBLIC_*` 变量。

## 目录约定

```text
apps/iris/
├── app/                 # 页面、布局和全局视觉样式
├── components/          # 纯前端交互与渲染组件
├── lib/
│   ├── contracts.ts     # Iris 与教学网关的类型契约
│   ├── gateway.ts       # 适配器选择
│   └── gateways/        # 演示 / HTTP 适配器
└── public/branding/     # 从旧 Iris 前端复用的品牌素材
```

## 边界

- 前端只发送用户任务语义，不发送 SQL 或数据库筛选实现。
- 前端只渲染 `LearningResponse`，不自行推断掌握度变化。
- 正式状态写回必须由 API 规则层校验证据后完成。
- PgSQL 与 SQLite 的字段变化不应直接传播到组件；由网关契约吸收变化。
