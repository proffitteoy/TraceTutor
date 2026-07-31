from __future__ import annotations

import sqlite3
from typing import Any

from tracetutor_state.db import Database
from tracetutor_state.errors import DomainValidationError, NotFoundError
from tracetutor_state.json_utils import decode_mapping, decode_rows, dumps, loads
from tracetutor_state.schemas import ConfigUpsert
from tracetutor_state.services.state_rules import sqlite_timestamp


class ConfigService:
    """Read and write system_kv with global → user → session precedence.

    The PDF keeps ``key`` as the primary key while also allowing global/user/session
    scopes. To preserve that schema, non-global values are stored under a namespaced
    physical key and exposed through this service with a normal logical key.
    """

    def __init__(self, database: Database):
        self.database = database

    @staticmethod
    def storage_key(key: str, scope: str, owner_id: str | None) -> str:
        if scope == "global":
            return key
        if not owner_id:
            raise DomainValidationError("owner_id is required for scoped config")
        return f"{scope}:{owner_id}:{key}"

    @staticmethod
    def logical_key(storage_key: str, scope: str) -> str:
        if scope == "global":
            return storage_key
        parts = storage_key.split(":", 2)
        return parts[2] if len(parts) == 3 else storage_key

    def upsert(self, data: ConfigUpsert) -> dict[str, Any]:
        storage_key = self.storage_key(data.key, data.scope, data.owner_id)
        now = sqlite_timestamp()
        with self.database.transaction() as connection:
            if data.scope == "user":
                if connection.execute(
                    "SELECT 1 FROM user_profile WHERE user_id = ?", (data.owner_id,)
                ).fetchone() is None:
                    raise NotFoundError("user not found")
            elif data.scope == "session":
                if connection.execute(
                    "SELECT 1 FROM learning_session WHERE id = ?", (data.owner_id,)
                ).fetchone() is None:
                    raise NotFoundError("session not found")
            connection.execute(
                """
                INSERT INTO system_kv(key, value_json, scope, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    scope = excluded.scope,
                    updated_at = excluded.updated_at
                """,
                (storage_key, dumps(data.value), data.scope, now),
            )
            row = connection.execute(
                "SELECT * FROM system_kv WHERE key = ?", (storage_key,)
            ).fetchone()
        result = decode_mapping(row) or {}
        result["key"] = data.key
        result["owner_id"] = data.owner_id
        return result

    def get(self, key: str, scope: str = "global", owner_id: str | None = None) -> dict[str, Any]:
        storage_key = self.storage_key(key, scope, owner_id)
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM system_kv WHERE key = ?", (storage_key,)
            ).fetchone()
        if row is None:
            raise NotFoundError("config key not found")
        result = decode_mapping(row) or {}
        result["key"] = key
        result["owner_id"] = owner_id
        return result

    def list(self, scope: str | None = None, owner_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM system_kv WHERE 1 = 1"
        params: list[Any] = []
        if scope:
            query += " AND scope = ?"
            params.append(scope)
        if scope and scope != "global" and owner_id:
            query += " AND key LIKE ?"
            params.append(f"{scope}:{owner_id}:%")
        query += " ORDER BY scope, key"
        with self.database.read() as connection:
            rows = decode_rows(connection.execute(query, params).fetchall())
        result: list[dict[str, Any]] = []
        for row in rows:
            row["owner_id"] = None
            if row["scope"] != "global":
                parts = row["key"].split(":", 2)
                if len(parts) == 3:
                    row["owner_id"] = parts[1]
                    row["key"] = parts[2]
            result.append(row)
        return result

    def delete(self, key: str, scope: str = "global", owner_id: str | None = None) -> None:
        storage_key = self.storage_key(key, scope, owner_id)
        with self.database.transaction() as connection:
            cursor = connection.execute("DELETE FROM system_kv WHERE key = ?", (storage_key,))
            if cursor.rowcount == 0:
                raise NotFoundError("config key not found")

    @classmethod
    def get_effective_from_connection(
        cls,
        connection: sqlite3.Connection,
        key: str,
        *,
        user_id: str | None = None,
        session_id: str | None = None,
        default: Any = None,
    ) -> Any:
        candidates: list[str] = []
        if session_id:
            candidates.append(cls.storage_key(key, "session", session_id))
        if user_id:
            candidates.append(cls.storage_key(key, "user", user_id))
        candidates.append(key)
        for storage_key in candidates:
            row = connection.execute(
                "SELECT value_json FROM system_kv WHERE key = ?", (storage_key,)
            ).fetchone()
            if row is not None:
                return loads(row["value_json"], default)
        return default

    def effective(self, key: str, user_id: str | None = None, session_id: str | None = None, default: Any = None) -> Any:
        with self.database.read() as connection:
            return self.get_effective_from_connection(
                connection,
                key,
                user_id=user_id,
                session_id=session_id,
                default=default,
            )


    @classmethod
    def effective_bundle_from_connection(
        cls,
        connection: sqlite3.Connection,
        *,
        user_id: str | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        globals_rows = connection.execute(
            "SELECT key, value_json FROM system_kv WHERE scope = 'global'"
        ).fetchall()
        bundle = {row["key"]: loads(row["value_json"]) for row in globals_rows}
        if user_id:
            prefix = f"user:{user_id}:"
            for row in connection.execute(
                "SELECT key, value_json FROM system_kv WHERE scope = 'user' AND key LIKE ?",
                (prefix + "%",),
            ).fetchall():
                bundle[row["key"][len(prefix):]] = loads(row["value_json"])
        if session_id:
            prefix = f"session:{session_id}:"
            for row in connection.execute(
                "SELECT key, value_json FROM system_kv WHERE scope = 'session' AND key LIKE ?",
                (prefix + "%",),
            ).fetchall():
                bundle[row["key"][len(prefix):]] = loads(row["value_json"])
        return bundle
    def effective_bundle(self, user_id: str | None = None, session_id: str | None = None) -> dict[str, Any]:
        with self.database.read() as connection:
            globals_rows = connection.execute(
                "SELECT key, value_json FROM system_kv WHERE scope = 'global'"
            ).fetchall()
            bundle = {row["key"]: loads(row["value_json"]) for row in globals_rows}
            if user_id:
                prefix = f"user:{user_id}:"
                for row in connection.execute(
                    "SELECT key, value_json FROM system_kv WHERE scope = 'user' AND key LIKE ?",
                    (prefix + "%",),
                ).fetchall():
                    bundle[row["key"][len(prefix):]] = loads(row["value_json"])
            if session_id:
                prefix = f"session:{session_id}:"
                for row in connection.execute(
                    "SELECT key, value_json FROM system_kv WHERE scope = 'session' AND key LIKE ?",
                    (prefix + "%",),
                ).fetchall():
                    bundle[row["key"][len(prefix):]] = loads(row["value_json"])
        return bundle
