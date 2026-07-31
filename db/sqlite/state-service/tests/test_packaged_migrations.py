from pathlib import Path


def test_packaged_migrations_match_repository_migrations():
    root = Path(__file__).parents[1]
    source_dir = root.parent / "migrations"
    packaged_dir = root / "src" / "tracetutor_state" / "sql_migrations"

    source_files = sorted(path.name for path in source_dir.glob("*.sql"))
    packaged_files = sorted(path.name for path in packaged_dir.glob("*.sql"))
    assert packaged_files == source_files
    for name in source_files:
        assert (packaged_dir / name).read_text(encoding="utf-8") == (
            source_dir / name
        ).read_text(encoding="utf-8")
