# 验证报告

验证日期：2026-07-30

## 范围

- Python 语法编译；
- 全部 SQLite 状态服务测试；
- 6 个 migration 的顺序执行和打包副本一致性；
- 表、索引、触发器、视图与外键检查；
- OpenAPI operationId 数量和唯一性；
- `ToolExecutionPort` 的作答、复习、幂等、pending/apply、作用域拒绝和查询闭环。

## 结果

```text
pytest: 25 passed
schema_version: 6
tables: 20
indexes: 31
triggers: 20
views: 5
foreign_key_violations: []
OpenAPI paths: 65
OpenAPI operations: 71
operationId duplicates: 0
packaged migrations match: true
```

## 命令

```powershell
python -m compileall -q src tests scripts
python -m pytest -q
python scripts/verify_release.py
```

## 未覆盖

- 真实 PgSQL 资产引用和 8 个 `asset.*` 工具；
- 真实模型 API；
- Iris、API、PgSQL、SQLite 的完整端到端流程；
- 生产网络、备份和恢复演练；
- 高并发或多实例写入。

Python 测试产生一条上游依赖警告：当前 FastAPI/Starlette 测试客户端提示未来将迁移到 `httpx2`，不影响本轮 25 个测试结果。
