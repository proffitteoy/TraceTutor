#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db", nargs="?", default="data/tracetutor_state.db")
    args = parser.parse_args()
    path = Path(args.db)
    if not path.exists():
        raise SystemExit(f"Database does not exist: {path}")

    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    tables = connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    for row in tables:
        table = row["name"]
        count = connection.execute(f'SELECT COUNT(*) AS n FROM "{table}"').fetchone()["n"]
        print(f"{table:28} {count}")
    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    print(f"foreign_key_violations: {len(violations)}")
    connection.close()


if __name__ == "__main__":
    main()
