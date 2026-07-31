from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path

from tracetutor_state.db import Database

MIGRATION_PATTERN = re.compile(r"^(?P<version>\d+)_(?P<name>.+)\.sql$")


def default_migrations_dir() -> Path:
    """Resolve migrations both from a source checkout and an installed wheel."""
    configured = os.getenv("TRACE_TUTOR_SQLITE_MIGRATIONS_DIR")
    candidates = [
        Path(configured).expanduser() if configured else None,
        Path(__file__).resolve().parents[3] / "migrations",
        Path(__file__).resolve().parent / "sql_migrations",
    ]
    for candidate in candidates:
        if candidate is not None and candidate.exists():
            return candidate.resolve()
    raise FileNotFoundError("Could not locate SQLite migration files")


class MigrationRunner:
    def __init__(self, database: Database, migrations_dir: str | Path):
        self.database = database
        self.migrations_dir = Path(migrations_dir)

    def migrate(self) -> list[int]:
        self._ensure_migration_table()
        applied = self._applied_versions()
        newly_applied: list[int] = []

        for version, name, path in self._discover():
            if version in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            escaped_name = name.replace("'", "''")
            script = (
                "BEGIN IMMEDIATE;\n"
                + sql
                + "\n"
                + f"INSERT INTO schema_migration(version, name) VALUES ({version}, '{escaped_name}');\n"
                + "COMMIT;\n"
            )
            connection = self.database.connect()
            try:
                connection.executescript(script)
            except Exception:
                try:
                    connection.execute("ROLLBACK")
                except sqlite3.OperationalError:
                    pass
                raise
            finally:
                connection.close()
            newly_applied.append(version)
        return newly_applied

    def current_version(self) -> int:
        self._ensure_migration_table()
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration"
            ).fetchone()
        return int(row["version"])

    def foreign_key_violations(self) -> list[dict[str, object]]:
        with self.database.read() as connection:
            rows = connection.execute("PRAGMA foreign_key_check").fetchall()
        return [dict(row) for row in rows]

    def _ensure_migration_table(self) -> None:
        with self.database.transaction() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migration (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def _applied_versions(self) -> set[int]:
        with self.database.read() as connection:
            rows = connection.execute("SELECT version FROM schema_migration").fetchall()
        return {int(row["version"]) for row in rows}

    def _discover(self) -> list[tuple[int, str, Path]]:
        if not self.migrations_dir.exists():
            raise FileNotFoundError(f"Migration directory not found: {self.migrations_dir}")
        migrations: list[tuple[int, str, Path]] = []
        for path in self.migrations_dir.glob("*.sql"):
            match = MIGRATION_PATTERN.match(path.name)
            if not match:
                continue
            migrations.append(
                (int(match.group("version")), match.group("name"), path)
            )
        migrations.sort(key=lambda item: item[0])
        versions = [item[0] for item in migrations]
        if len(versions) != len(set(versions)):
            raise ValueError("Duplicate migration version detected")
        return migrations
