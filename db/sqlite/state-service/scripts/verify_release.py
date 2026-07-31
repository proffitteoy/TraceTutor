#!/usr/bin/env python3
"""Release-time structural verification without creating a repository DB file."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from tracetutor_state.db import Database
from tracetutor_state.main import create_app
from tracetutor_state.migrations import MigrationRunner

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT.parent / "migrations"
EXPECTED = {
    "schema_version": 6,
    "tables": 20,
    "indexes": 31,
    "triggers": 20,
    "views": 5,
    "openapi_operations": 71,
}


def main() -> None:
    with TemporaryDirectory() as directory:
        db_path = Path(directory) / "release-check.db"
        database = Database(db_path)
        runner = MigrationRunner(database, MIGRATIONS_DIR)
        applied = runner.migrate()
        with database.read() as connection:
            counts = {}
            plural = {"table": "tables", "index": "indexes", "trigger": "triggers", "view": "views"}
            for object_type in ("table", "index", "trigger", "view"):
                counts[plural[object_type]] = int(
                    connection.execute(
                        """
                        SELECT COUNT(*) AS value FROM sqlite_master
                        WHERE type = ? AND name NOT LIKE 'sqlite_%'
                        """,
                        (object_type,),
                    ).fetchone()["value"]
                )
            pragmas = {
                "foreign_keys": connection.execute("PRAGMA foreign_keys").fetchone()[0],
                "journal_mode": connection.execute("PRAGMA journal_mode").fetchone()[0],
                "synchronous": connection.execute("PRAGMA synchronous").fetchone()[0],
                "busy_timeout": connection.execute("PRAGMA busy_timeout").fetchone()[0],
            }
        schema_version = runner.current_version()
        foreign_key_violations = runner.foreign_key_violations()
        schema = create_app(db_path=Path(directory) / "openapi.db").openapi()
        operations = [
            operation["operationId"]
            for item in schema["paths"].values()
            for method, operation in item.items()
            if method.lower() in {"get", "post", "put", "patch", "delete"}
        ]

    root_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    package_files = sorted((ROOT / "src" / "tracetutor_state" / "sql_migrations").glob("*.sql"))
    migrations_match = [path.name for path in root_files] == [path.name for path in package_files] and all(
        left.read_text(encoding="utf-8") == right.read_text(encoding="utf-8")
        for left, right in zip(root_files, package_files, strict=True)
    )
    report = {
        "applied_migrations": applied,
        "schema_version": schema_version,
        **counts,
        "foreign_key_violations": foreign_key_violations,
        "pragmas": pragmas,
        "openapi_paths": len(schema["paths"]),
        "openapi_operations": len(operations),
        "operation_ids_unique": len(operations) == len(set(operations)),
        "packaged_migrations_match": migrations_match,
    }
    checks = {
        "schema_version": report["schema_version"] == EXPECTED["schema_version"],
        "tables": report["tables"] == EXPECTED["tables"],
        "indexes": report["indexes"] == EXPECTED["indexes"],
        "triggers": report["triggers"] == EXPECTED["triggers"],
        "views": report["views"] == EXPECTED["views"],
        "openapi_operations": report["openapi_operations"] == EXPECTED["openapi_operations"],
        "foreign_keys": report["foreign_key_violations"] == [],
        "pragmas": report["pragmas"] == {
            "foreign_keys": 1,
            "journal_mode": "wal",
            "synchronous": 1,
            "busy_timeout": 5000,
        },
        "operation_ids_unique": report["operation_ids_unique"],
        "packaged_migrations_match": migrations_match,
    }
    report["checks"] = checks
    report["passed"] = all(checks.values())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
