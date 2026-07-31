from pathlib import Path

from tracetutor_state.db import Database
from tracetutor_state.migrations import MigrationRunner


def test_all_migrations_apply_and_are_idempotent(tmp_path: Path):
    database = Database(tmp_path / "migration.db")
    runner = MigrationRunner(database, Path(__file__).parents[2] / "migrations")

    assert runner.migrate() == [1, 2, 3, 4, 5, 6]
    assert runner.migrate() == []
    assert runner.current_version() == 6
    assert runner.foreign_key_violations() == []

    with database.read() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
    assert "question_attempt" in tables
    assert "mastery_state" in tables
    assert "pending_state_delta" in tables
    assert "workflow_run" in tables
