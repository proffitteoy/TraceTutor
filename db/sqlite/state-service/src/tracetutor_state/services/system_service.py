from __future__ import annotations

import sqlite3
from typing import Any
from uuid import uuid4

from tracetutor_state.db import Database
from tracetutor_state.errors import ConflictError, DomainValidationError, NotFoundError
from tracetutor_state.json_utils import decode_mapping, decode_rows, dumps
from tracetutor_state.schemas import (
    LocalEventCreate,
    RuntimeStateStatusUpdate,
    RuntimeStateUpsert,
    ToolCallCreate,
    WorkflowCreate,
    WorkflowUpdate,
)
from tracetutor_state.services.state_rules import sqlite_timestamp


class SystemService:
    def __init__(self, database: Database):
        self.database = database

    @staticmethod
    def _id(value: str | None = None) -> str:
        return value or str(uuid4())

    @staticmethod
    def _handle_integrity(exc: sqlite3.IntegrityError) -> None:
        message = str(exc)
        if any(
            marker in message
            for marker in (
                "session_user_mismatch",
                "workflow_user_mismatch",
                "attempt_user_mismatch",
            )
        ):
            raise DomainValidationError(message) from exc
        if "FOREIGN KEY" in message:
            raise DomainValidationError(
                "Referenced user/session/workflow does not exist"
            ) from exc
        if "UNIQUE" in message or "PRIMARY KEY" in message:
            raise ConflictError(message) from exc
        raise DomainValidationError(message) from exc

    @staticmethod
    def _event(
        connection: sqlite3.Connection,
        *,
        user_id: str | None,
        session_id: str | None,
        event_type: str,
        aggregate_type: str | None,
        aggregate_id: str | None,
        payload: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO local_event_log(
                id, user_id, session_id, event_type, aggregate_type,
                aggregate_id, event_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                user_id,
                session_id,
                event_type,
                aggregate_type,
                aggregate_id,
                dumps(payload),
                sqlite_timestamp(),
            ),
        )

    def create_workflow(self, data: WorkflowCreate) -> dict[str, Any]:
        run_id = self._id(data.run_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO workflow_run(
                        id, user_id, session_id, workflow_name, status,
                        input_json, output_json, current_step, started_at,
                        metadata_json
                    ) VALUES (?, ?, ?, ?, 'running', ?, '{}', ?, ?, ?)
                    """,
                    (
                        run_id,
                        data.user_id,
                        data.session_id,
                        data.workflow_name,
                        dumps(data.input),
                        data.current_step,
                        now,
                        dumps(data.metadata),
                    ),
                )
                self._event(
                    connection,
                    user_id=data.user_id,
                    session_id=data.session_id,
                    event_type="workflow_started",
                    aggregate_type="workflow",
                    aggregate_id=run_id,
                    payload={
                        "workflow_name": data.workflow_name,
                        "current_step": data.current_step,
                    },
                )
                row = connection.execute(
                    "SELECT * FROM workflow_run WHERE id = ?", (run_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def update_workflow(self, run_id: str, data: WorkflowUpdate) -> dict[str, Any]:
        fields: list[str] = []
        values: list[Any] = []
        if data.status is not None:
            fields.append("status = ?")
            values.append(data.status)
            if data.status in {"succeeded", "failed", "cancelled"}:
                fields.append("completed_at = ?")
                values.append(sqlite_timestamp())
        if data.output is not None:
            fields.append("output_json = ?")
            values.append(dumps(data.output))
        if data.current_step is not None:
            fields.append("current_step = ?")
            values.append(data.current_step)
        if data.error_message is not None:
            fields.append("error_message = ?")
            values.append(data.error_message)
        if data.metadata is not None:
            fields.append("metadata_json = ?")
            values.append(dumps(data.metadata))
        if not fields:
            return self.get_workflow(run_id)
        values.append(run_id)
        with self.database.transaction() as connection:
            current = connection.execute(
                "SELECT * FROM workflow_run WHERE id = ?", (run_id,)
            ).fetchone()
            if current is None:
                raise NotFoundError("workflow_run not found")
            connection.execute(
                f"UPDATE workflow_run SET {', '.join(fields)} WHERE id = ?", values
            )
            row = connection.execute(
                "SELECT * FROM workflow_run WHERE id = ?", (run_id,)
            ).fetchone()
            event_type = "workflow_failed" if row["status"] == "failed" else "workflow_updated"
            self._event(
                connection,
                user_id=row["user_id"],
                session_id=row["session_id"],
                event_type=event_type,
                aggregate_type="workflow",
                aggregate_id=run_id,
                payload={
                    "status": row["status"],
                    "current_step": row["current_step"],
                    "error_message": row["error_message"],
                },
            )
        return decode_mapping(row) or {}

    def get_workflow(self, run_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM workflow_run WHERE id = ?", (run_id,)
            ).fetchone()
            if row is None:
                raise NotFoundError("workflow_run not found")
            tools = connection.execute(
                "SELECT * FROM tool_call_log WHERE workflow_run_id = ? ORDER BY created_at",
                (run_id,),
            ).fetchall()
            deltas = connection.execute(
                "SELECT * FROM pending_state_delta WHERE workflow_run_id = ? ORDER BY created_at",
                (run_id,),
            ).fetchall()
        result = decode_mapping(row) or {}
        result["tool_calls"] = decode_rows(tools)
        result["state_deltas"] = decode_rows(deltas)
        return result

    def list_workflows(
        self,
        user_id: str,
        *,
        session_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM workflow_run WHERE user_id = ?"
        params: list[Any] = [user_id]
        if session_id is not None:
            query += " AND session_id = ?"
            params.append(session_id)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def get_current_workflow(
        self, user_id: str, session_id: str | None = None
    ) -> dict[str, Any] | None:
        query = """
            SELECT * FROM workflow_run
            WHERE user_id = ? AND status IN ('running', 'waiting_user')
        """
        params: list[Any] = [user_id]
        if session_id is not None:
            query += " AND session_id = ?"
            params.append(session_id)
        query += " ORDER BY started_at DESC LIMIT 1"
        with self.database.read() as connection:
            row = connection.execute(query, params).fetchone()
        return decode_mapping(row)

    def write_tool_call(self, data: ToolCallCreate) -> dict[str, Any]:
        tool_call_id = self._id(data.tool_call_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO tool_call_log(
                        id, workflow_run_id, user_id, session_id, tool_name,
                        input_json, output_summary_json, status, error_message,
                        latency_ms, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        tool_call_id,
                        data.workflow_run_id,
                        data.user_id,
                        data.session_id,
                        data.tool_name,
                        dumps(data.input),
                        dumps(data.output_summary),
                        data.status,
                        data.error_message,
                        data.latency_ms,
                        now,
                    ),
                )
                self._event(
                    connection,
                    user_id=data.user_id,
                    session_id=data.session_id,
                    event_type="tool_call_recorded",
                    aggregate_type="workflow",
                    aggregate_id=data.workflow_run_id,
                    payload={
                        "tool_call_id": tool_call_id,
                        "tool_name": data.tool_name,
                        "status": data.status,
                        "latency_ms": data.latency_ms,
                    },
                )
                row = connection.execute(
                    "SELECT * FROM tool_call_log WHERE id = ?", (tool_call_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def get_tool_call(self, tool_call_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM tool_call_log WHERE id = ?", (tool_call_id,)
            ).fetchone()
        if row is None:
            raise NotFoundError("tool_call_log not found")
        return decode_mapping(row) or {}

    def list_tool_calls(
        self,
        user_id: str,
        *,
        workflow_run_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM tool_call_log WHERE user_id = ?"
        params: list[Any] = [user_id]
        if workflow_run_id:
            query += " AND workflow_run_id = ?"
            params.append(workflow_run_id)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def get_last_tool_call(self, user_id: str) -> dict[str, Any] | None:
        with self.database.read() as connection:
            row = connection.execute(
                """
                SELECT * FROM tool_call_log
                WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        result = decode_mapping(row)
        if result is not None:
            result["succeeded"] = result["status"] == "succeeded"
        return result

    def upsert_runtime_state(self, data: RuntimeStateUpsert) -> dict[str, Any]:
        runtime_id = self._id(data.runtime_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO agent_runtime_state(
                        id, user_id, session_id, agent_name, state_key,
                        state_value_json, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, session_id, agent_name, state_key)
                    DO UPDATE SET state_value_json = excluded.state_value_json,
                                  status = excluded.status,
                                  updated_at = excluded.updated_at
                    """,
                    (
                        runtime_id,
                        data.user_id,
                        data.session_id,
                        data.agent_name,
                        data.state_key,
                        dumps(data.state_value),
                        data.status,
                        now,
                        now,
                    ),
                )
                row = connection.execute(
                    """
                    SELECT * FROM agent_runtime_state
                    WHERE user_id = ?
                      AND ((session_id = ?) OR (session_id IS NULL AND ? IS NULL))
                      AND agent_name = ? AND state_key = ?
                    """,
                    (
                        data.user_id,
                        data.session_id,
                        data.session_id,
                        data.agent_name,
                        data.state_key,
                    ),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def list_runtime_state(
        self,
        user_id: str,
        *,
        session_id: str | None = None,
        agent_name: str | None = None,
        status: str | None = "active",
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM agent_runtime_state WHERE user_id = ?"
        params: list[Any] = [user_id]
        if session_id is not None:
            query += " AND session_id = ?"
            params.append(session_id)
        if agent_name:
            query += " AND agent_name = ?"
            params.append(agent_name)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY agent_name, state_key"
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def update_runtime_status(
        self, runtime_id: str, data: RuntimeStateStatusUpdate
    ) -> dict[str, Any]:
        with self.database.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE agent_runtime_state
                SET status = ?, updated_at = ? WHERE id = ?
                """,
                (data.status, sqlite_timestamp(), runtime_id),
            )
            if cursor.rowcount == 0:
                raise NotFoundError("agent_runtime_state not found")
            row = connection.execute(
                "SELECT * FROM agent_runtime_state WHERE id = ?", (runtime_id,)
            ).fetchone()
        return decode_mapping(row) or {}

    def write_local_event(self, data: LocalEventCreate) -> dict[str, Any]:
        event_id = self._id(data.event_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO local_event_log(
                        id, user_id, session_id, event_type, aggregate_type,
                        aggregate_id, event_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        data.user_id,
                        data.session_id,
                        data.event_type,
                        data.aggregate_type,
                        data.aggregate_id,
                        dumps(data.event),
                        now,
                    ),
                )
                row = connection.execute(
                    "SELECT * FROM local_event_log WHERE id = ?", (event_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}
