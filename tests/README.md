# 测试目录

当前可运行测试位于各组件目录：

- `apps/api/test`：查询计划、状态证据、工具注册、HTTP 边界与本地 Agent Runtime。
- `apps/iris`：当前以 TypeScript 检查和 Next.js 生产构建验证渲染契约。

执行：

```powershell
Set-Location apps/api
npm test
npm run type-check

Set-Location ../iris
npm run type-check
npm run build
```

数据库协作者交付后，应在 `db/pgsql`、`db/sqlite` 各自目录增加迁移测试，并在本目录补跨数据库工具端口的集成测试说明。
