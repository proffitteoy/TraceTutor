from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv

from tracetutor_state.config import Settings
from tracetutor_state.db import Database
from tracetutor_state.migrations import MigrationRunner, default_migrations_dir
from tracetutor_state.schemas import UserCreate
from tracetutor_state.services import StateService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="TraceTutor SQLite state service CLI")
    parser.add_argument(
        "--db",
        default=None,
        help="SQLite path. Defaults to TRACE_TUTOR_SQLITE_PATH or data/tracetutor_state.db",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="Apply all migration files")
    sub.add_parser("version", help="Print current schema version")
    sub.add_parser("check", help="Run SQLite foreign-key check")
    sub.add_parser("create-demo-user", help="Create a local demo user")
    return parser


def main() -> None:
    load_dotenv()
    args = build_parser().parse_args()
    settings = Settings.from_env(args.db)
    database = Database(settings.db_path)
    runner = MigrationRunner(database, default_migrations_dir())

    if args.command == "migrate":
        applied = runner.migrate()
        print(json.dumps({"database": str(database.path), "applied": applied}, ensure_ascii=False))
    elif args.command == "version":
        print(runner.current_version())
    elif args.command == "check":
        runner.migrate()
        print(json.dumps(runner.foreign_key_violations(), ensure_ascii=False, indent=2))
    elif args.command == "create-demo-user":
        runner.migrate()
        user = StateService(database).create_user(
            UserCreate(
                user_id=str(uuid4()),
                display_name="演示用户",
                current_subject="高等数学",
                current_stage="大学一年级",
                preferences={
                    "explanation_style": "先整体框架，再细节推导",
                    "preferred_difficulty": 3,
                    "show_solution_steps": True,
                },
            )
        )
        print(json.dumps(user, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
