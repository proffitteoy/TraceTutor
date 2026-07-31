#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${TRACE_TUTOR_SQLITE_PATH:-data/tracetutor_state.db}"
rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
echo "Removed SQLite runtime files for: $DB_PATH"
