#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from tempfile import TemporaryDirectory

from tracetutor_state.main import create_app

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "API_OPERATION_CATALOG.md"
METHODS = {"get", "post", "put", "patch", "delete"}


def main() -> None:
    with TemporaryDirectory() as directory:
        schema = create_app(db_path=Path(directory) / "catalog.db").openapi()
    groups: dict[str, list[tuple[str, str, str, str]]] = defaultdict(list)
    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if method.lower() not in METHODS:
                continue
            tag = (operation.get("tags") or ["other"])[0]
            groups[tag].append(
                (
                    operation["operationId"],
                    method.upper(),
                    path,
                    operation.get("summary", ""),
                )
            )
    lines = [
        "# OpenAPI 操作完整目录",
        "",
        "本文件由 `scripts/generate_api_catalog.py` 从 FastAPI OpenAPI 自动生成。",
        "",
        f"- Paths：{len(schema['paths'])}",
        f"- Operations：{sum(len(items) for items in groups.values())}",
        "- `operationId`：全部唯一",
        "",
    ]
    tag_titles = {
        "meta": "服务元信息",
        "state": "用户学习事实、状态、记忆与复习",
        "system": "Workflow、工具调用、运行状态与日志",
        "config": "system_kv 配置",
        "tool-execution": "apps/api 内部 ToolExecutionPort",
    }
    for tag in ("meta", "tool-execution", "state", "system", "config"):
        items = sorted(groups.get(tag, []))
        lines.extend(
            [
                f"## {tag_titles.get(tag, tag)}（{len(items)}）",
                "",
                "| operationId | HTTP | 路径 |",
                "|---|---|---|",
            ]
        )
        for operation_id, method, path, _summary in items:
            lines.append(f"| `{operation_id}` | `{method}` | `{path}` |")
        lines.append("")
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
