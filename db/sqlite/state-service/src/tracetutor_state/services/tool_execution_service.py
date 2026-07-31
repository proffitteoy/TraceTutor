from __future__ import annotations

import sqlite3
from typing import Any, Mapping, cast
from uuid import uuid4

from pydantic import ValidationError

from tracetutor_state.db import Database
from tracetutor_state.errors import ConflictError, DomainValidationError
from tracetutor_state.json_utils import decode_mapping, decode_rows, dumps, loads
from tracetutor_state.services.state_rules import (
    parse_sqlite_timestamp,
    sqlite_timestamp,
)
from tracetutor_state.services.state_service import StateService
from tracetutor_state.tool_contracts import (
    ApplyStateDeltaInput,
    QueryReviewDueItemsInput,
    QueryUserSnapshotInput,
    QueryWrongQuestionsInput,
    StateDelta,
    ToolName,
    ToolRequestContext,
    TOOL_INPUT_MODELS,
    WriteAgentEventInput,
    WriteAttemptResultInput,
    WriteReviewResultInput,
)

CONTRACT_STATE_LABELS = {
    "attempted": {"exposed", "learning", "weak", "reviewing", "stable", "mastered"},
    "understood": {"learning", "stable", "mastered"},
    "weak": {"weak"},
    "reviewing": {"reviewing"},
    "stable": {"stable", "mastered"},
}


class ToolExecutionService:
    """Exact SQLite implementation of apps/api/src/ports.ts.

    This service is internal to TraceTutor. It accepts only the seven
    SQLite/log tool names currently declared by apps/api and always derives
    user/session ownership from the trusted request context.
    """

    def __init__(self, database: Database, asset_validator: Any):
        self.database = database
        self.state = StateService(database, asset_validator=asset_validator)
        self.asset_validator = asset_validator

    def execute(
        self,
        tool: ToolName,
        raw_input: Mapping[str, Any],
        context: ToolRequestContext,
    ) -> dict[str, Any]:
        model = TOOL_INPUT_MODELS[tool]
        try:
            data = model.model_validate(raw_input)
        except ValidationError as exc:
            raise DomainValidationError(
                f"Tool input does not match {tool}: {exc}"
            ) from exc
        if data.user_id != context.user_id or data.session_id != context.session_id:
            raise DomainValidationError(
                "Tool input user/session must match the trusted request context"
            )

        if tool == "state.query_user_snapshot":
            return self._query_user_snapshot(
                cast(QueryUserSnapshotInput, data), context
            )
        if tool == "state.query_wrong_questions":
            return self._query_wrong_questions(
                cast(QueryWrongQuestionsInput, data), context
            )
        if tool == "state.query_review_due_items":
            return self._query_review_due_items(
                cast(QueryReviewDueItemsInput, data), context
            )
        if tool == "state.write_attempt_result":
            return self._write_attempt_result(
                cast(WriteAttemptResultInput, data), context
            )
        if tool == "state.write_review_result":
            return self._write_review_result(
                cast(WriteReviewResultInput, data), context
            )
        if tool == "state.apply_state_delta":
            return self._apply_state_delta(
                cast(ApplyStateDeltaInput, data), context
            )
        return self._write_agent_event(cast(WriteAgentEventInput, data), context)

    @staticmethod
    def _meta(
        context: ToolRequestContext, status: str, reason: str
    ) -> dict[str, str]:
        return {
            "source": "sqlite",
            "status": status,
            "reason": reason,
            "request_id": context.request_id,
        }

    @staticmethod
    def _ensure_scope(
        connection: sqlite3.Connection, user_id: str, session_id: str
    ) -> None:
        now = sqlite_timestamp()
        connection.execute(
            """
            INSERT INTO user_profile(
                user_id, preference_json, created_at, updated_at
            ) VALUES (?, '{}', ?, ?)
            ON CONFLICT(user_id) DO NOTHING
            """,
            (user_id, now, now),
        )
        existing = connection.execute(
            "SELECT user_id FROM learning_session WHERE id = ?", (session_id,)
        ).fetchone()
        if existing is not None and existing["user_id"] != user_id:
            raise DomainValidationError("session_user_mismatch")
        connection.execute(
            """
            INSERT INTO learning_session(
                id, user_id, session_type, status, started_at, metadata_json
            ) VALUES (?, ?, 'mixed', 'active', ?, '{}')
            ON CONFLICT(id) DO NOTHING
            """,
            (session_id, user_id, now),
        )

    @staticmethod
    def _judgement_columns(
        judgement: str,
    ) -> tuple[int | None, float | None, str]:
        if judgement == "correct":
            return 1, 1.0, "checked"
        if judgement == "incorrect":
            return 0, 0.0, "checked"
        if judgement == "partial":
            return None, 0.5, "checked"
        return None, None, "submitted"

    @staticmethod
    def _contract_judgement(attempt: Mapping[str, Any]) -> str:
        if attempt["is_correct"] is not None:
            return "correct" if int(attempt["is_correct"]) == 1 else "incorrect"
        if attempt["score"] is None:
            return "ungraded"
        score = float(attempt["score"])
        if score >= 0.8:
            return "correct"
        if score <= 0.3:
            return "incorrect"
        return "partial"

    @staticmethod
    def _proposed_change(judgement: str) -> float:
        if judgement == "correct":
            return 0.1
        if judgement == "incorrect":
            return -0.1
        return 0.0

    def _query_user_snapshot(
        self, data: QueryUserSnapshotInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        with self.database.read() as connection:
            user_exists = connection.execute(
                "SELECT 1 FROM user_profile WHERE user_id = ?", (data.user_id,)
            ).fetchone()
            session_exists = connection.execute(
                """
                SELECT 1 FROM learning_session
                WHERE id = ? AND user_id = ?
                """,
                (data.session_id, data.user_id),
            ).fetchone()
        if user_exists is None or session_exists is None:
            return {
                "result": {
                    "user_snapshot": {
                        "user_id": data.user_id,
                        "session_id": data.session_id,
                    },
                    "weak_mastery_items": [],
                    "due_reviews": [],
                    "recent_error_patterns": [],
                    "open_loops": [],
                },
                "meta": self._meta(
                    context, "empty", "当前用户或学习会话尚无 SQLite 状态"
                ),
            }
        snapshot = self.state.get_agent_bootstrap_context(
            data.user_id, data.session_id
        )
        return {
            "result": snapshot,
            "meta": self._meta(
                context, "ok", "已读取用户学习快照和压缩上下文"
            ),
        }

    def _query_wrong_questions(
        self, data: QueryWrongQuestionsInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        allowed_db_labels = {
            label
            for requested in data.state_labels
            for label in CONTRACT_STATE_LABELS[requested]
        }
        params: list[Any] = [data.user_id]
        query = """
            SELECT DISTINCT a.*
            FROM question_attempt a
            LEFT JOIN question_attempt_tag t ON t.attempt_id = a.id
            LEFT JOIN mastery_state m
              ON m.user_id = a.user_id
             AND m.entity_type = t.tag_type
             AND m.entity_name = t.tag_name
            WHERE a.user_id = ? AND a.is_correct = 0
        """
        if data.knowledge_point_ids:
            placeholders = ",".join("?" for _ in data.knowledge_point_ids)
            query += (
                " AND EXISTS (SELECT 1 FROM question_attempt_tag kt"
                " WHERE kt.attempt_id = a.id"
                " AND kt.tag_type = 'knowledge_point'"
                f" AND kt.tag_id IN ({placeholders}))"
            )
            params.extend(data.knowledge_point_ids)
        if data.knowledge_area:
            query += (
                " AND EXISTS (SELECT 1 FROM question_attempt_tag nt"
                " WHERE nt.attempt_id = a.id"
                " AND nt.tag_type = 'knowledge_point'"
                " AND nt.tag_name LIKE ?)"
            )
            params.append(f"%{data.knowledge_area}%")
        if allowed_db_labels:
            placeholders = ",".join("?" for _ in allowed_db_labels)
            query += f" AND (m.state_label IN ({placeholders}) OR m.id IS NULL)"
            params.extend(sorted(allowed_db_labels))
        if data.recent_only:
            query += " AND a.created_at >= datetime('now', '-30 days')"
        query += " ORDER BY a.created_at DESC LIMIT ?"
        params.append(data.limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
            items = self.state._attempts_with_tags(connection, rows)
        return {
            "items": items,
            "meta": self._meta(
                context,
                "ok" if items else "empty",
                "已按用户、知识点和掌握状态筛选错题"
                if items
                else "没有符合条件的错题",
            ),
        }

    def _query_review_due_items(
        self, data: QueryReviewDueItemsInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        due_at = sqlite_timestamp()
        if data.due_before:
            parsed = parse_sqlite_timestamp(data.due_before)
            if parsed is None:
                raise DomainValidationError("due_before must be an ISO datetime")
            due_at = sqlite_timestamp(parsed)
        placeholders = ",".join("?" for _ in data.target_types)
        params: list[Any] = [data.user_id, *data.target_types, due_at, data.limit]
        with self.database.read() as connection:
            rows = connection.execute(
                f"""
                SELECT * FROM review_schedule
                WHERE user_id = ?
                  AND target_type IN ({placeholders})
                  AND status IN ('scheduled', 'due')
                  AND due_at <= ?
                ORDER BY priority_score DESC, due_at ASC
                LIMIT ?
                """,
                params,
            ).fetchall()
        items = decode_rows(rows)
        return {
            "items": items,
            "meta": self._meta(
                context,
                "ok" if items else "empty",
                "已读取到期复习项" if items else "当前没有到期复习项",
            ),
        }

    def _write_attempt_result(
        self, data: WriteAttemptResultInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        self.asset_validator.validate_question_id(data.question_id)
        for tag_id in data.knowledge_point_ids:
            self.asset_validator.validate_tag_id("knowledge_point", tag_id)
        for tag_id in data.method_ids:
            self.asset_validator.validate_tag_id("method", tag_id)

        is_correct, score, attempt_status = self._judgement_columns(data.judgement)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                self._ensure_scope(connection, data.user_id, data.session_id)
                existing = connection.execute(
                    """
                    SELECT * FROM question_attempt
                    WHERE user_id = ? AND client_event_id = ?
                    """,
                    (data.user_id, data.client_event_id),
                ).fetchone()
                if existing is not None:
                    if (
                        existing["session_id"] != data.session_id
                        or existing["question_id"] != data.question_id
                    ):
                        raise ConflictError(
                            "client_event_id is already bound to another attempt"
                        )
                    candidates = self._attempt_candidates(connection, existing)
                    return {
                        "result": {
                            "attempt_id": existing["id"],
                            "pending_state_deltas": candidates,
                            "idempotent": True,
                        },
                        "meta": self._meta(
                            context,
                            "ok",
                            "重复客户端事件已返回原作答事实",
                        ),
                    }

                attempt_id = str(uuid4())
                connection.execute(
                    """
                    INSERT INTO question_attempt(
                        id, user_id, session_id, question_id, source_type,
                        user_answer_text, is_correct, score, attempt_status,
                        created_at, checked_at, metadata_json, client_event_id
                    ) VALUES (?, ?, ?, ?, 'pgsql', ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        attempt_id,
                        data.user_id,
                        data.session_id,
                        data.question_id,
                        data.answer_text,
                        is_correct,
                        score,
                        attempt_status,
                        now,
                        now if attempt_status == "checked" else None,
                        dumps({"source": "ToolExecutionPort"}),
                        data.client_event_id,
                    ),
                )
                config = self.state._rule_config(
                    connection, data.user_id, data.session_id
                )
                for tag_type, tag_ids in (
                    ("knowledge_point", data.knowledge_point_ids),
                    ("method", data.method_ids),
                ):
                    for index, tag_id in enumerate(tag_ids):
                        role = "primary" if index == 0 else "secondary"
                        connection.execute(
                            """
                            INSERT INTO question_attempt_tag(
                                id, attempt_id, tag_type, tag_id, tag_name,
                                role, weight, confidence, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?)
                            """,
                            (
                                str(uuid4()),
                                attempt_id,
                                tag_type,
                                tag_id,
                                tag_id,
                                role,
                                config.default_tag_weight(tag_type, role),
                                now,
                            ),
                        )
                attempt = connection.execute(
                    "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
                ).fetchone()
                candidates = self._attempt_candidates(connection, attempt)
                self.state._write_local_event(
                    connection,
                    user_id=data.user_id,
                    session_id=data.session_id,
                    event_type="attempt_created",
                    aggregate_type="attempt",
                    aggregate_id=attempt_id,
                    payload={
                        "question_id": data.question_id,
                        "judgement": data.judgement,
                        "client_event_id": data.client_event_id,
                    },
                )
        except sqlite3.IntegrityError as exc:
            self.state._handle_integrity(exc)
        return {
            "result": {
                "attempt_id": attempt_id,
                "pending_state_deltas": candidates,
                "idempotent": False,
            },
            "meta": self._meta(
                context,
                "ok",
                "作答事实和待验证状态变化已原子写入",
            ),
        }

    def _attempt_candidates(
        self, connection: sqlite3.Connection, attempt: Mapping[str, Any]
    ) -> list[dict[str, Any]]:
        judgement = self._contract_judgement(attempt)
        if judgement == "ungraded":
            return []
        tags = connection.execute(
            """
            SELECT * FROM question_attempt_tag
            WHERE attempt_id = ?
            ORDER BY CASE tag_type WHEN 'knowledge_point' THEN 0 ELSE 1 END,
                     CASE role WHEN 'primary' THEN 0 ELSE 1 END,
                     created_at
            """,
            (attempt["id"],),
        ).fetchall()
        target = next(
            (
                tag
                for tag in tags
                if tag["tag_type"] in {"knowledge_point", "method"}
                and tag["tag_id"]
            ),
            None,
        )
        if target is None:
            return []
        knowledge_ids = [
            tag["tag_id"]
            for tag in tags
            if tag["tag_type"] == "knowledge_point" and tag["tag_id"]
        ]
        method_ids = [
            tag["tag_id"]
            for tag in tags
            if tag["tag_type"] == "method" and tag["tag_id"]
        ]
        state_delta = {
            "target_type": (
                "knowledge_mastery"
                if target["tag_type"] == "knowledge_point"
                else "method_mastery"
            ),
            "target_id": target["tag_id"],
            "proposed_change": self._proposed_change(judgement),
            "reason": "SQLite 规则层根据已判定作答和标签快照生成",
            "evidence": {
                "question_id": attempt["question_id"],
                "attempt_id": attempt["id"],
                "judgement": judgement,
                "knowledge_point_ids": knowledge_ids,
                "method_ids": method_ids,
            },
        }
        pending = connection.execute(
            """
            SELECT * FROM pending_state_delta
            WHERE attempt_id = ? AND delta_type = 'mastery_update'
              AND validation_status IN ('pending', 'approved', 'applied')
            ORDER BY created_at DESC LIMIT 1
            """,
            (attempt["id"],),
        ).fetchone()
        if pending is None:
            delta_id = str(uuid4())
            payload = {
                "action": "apply_attempt",
                "attempt_id": attempt["id"],
                "requested_entity_type": target["tag_type"],
                "requested_entity_id": target["tag_id"],
                "requested_entity_name": target["tag_name"],
                "entity_type": target["tag_type"],
                "entity_id": target["tag_id"],
                "entity_name": target["tag_name"],
                "mastery_change": state_delta["proposed_change"],
                "evidence": state_delta["evidence"],
            }
            connection.execute(
                """
                INSERT INTO pending_state_delta(
                    id, user_id, session_id, attempt_id, delta_type,
                    proposed_by, delta_json, validation_status, created_at
                ) VALUES (?, ?, ?, ?, 'mastery_update', 'rule', ?,
                          'pending', ?)
                """,
                (
                    delta_id,
                    attempt["user_id"],
                    attempt["session_id"],
                    attempt["id"],
                    dumps(payload),
                    sqlite_timestamp(),
                ),
            )
        else:
            delta_id = pending["id"]
        return [
            {
                "pending_state_delta_id": delta_id,
                "state_delta": state_delta,
            }
        ]

    def _write_review_result(
        self, data: WriteReviewResultInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        outcome = {
            "remembered": "success",
            "partial": "partial",
            "forgotten": "fail",
        }[data.outcome]
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                self._ensure_scope(connection, data.user_id, data.session_id)
                existing = connection.execute(
                    """
                    SELECT * FROM review_event
                    WHERE user_id = ? AND client_event_id = ?
                    """,
                    (data.user_id, data.client_event_id),
                ).fetchone()
                if existing is not None:
                    candidates = self._review_candidates(connection, existing)
                    return {
                        "result": {
                            "review_event_id": existing["id"],
                            "pending_state_deltas": candidates,
                            "idempotent": True,
                        },
                        "meta": self._meta(
                            context,
                            "ok",
                            "重复客户端事件已返回原复习事实",
                        ),
                    }
                attempt = connection.execute(
                    """
                    SELECT * FROM question_attempt
                    WHERE id = ? AND user_id = ? AND session_id = ?
                      AND question_id = ?
                    """,
                    (
                        data.attempt_id,
                        data.user_id,
                        data.session_id,
                        data.question_id,
                    ),
                ).fetchone()
                if attempt is None:
                    raise DomainValidationError(
                        "review attempt does not belong to current user/session/question"
                    )
                schedule = connection.execute(
                    """
                    SELECT * FROM review_schedule
                    WHERE id = ? AND user_id = ?
                    """,
                    (data.schedule_id, data.user_id),
                ).fetchone()
                if schedule is None:
                    raise DomainValidationError(
                        "review schedule does not belong to current user"
                    )
                tags = connection.execute(
                    """
                    SELECT * FROM question_attempt_tag
                    WHERE attempt_id = ? ORDER BY tag_type, role
                    """,
                    (data.attempt_id,),
                ).fetchall()
                event_id = str(uuid4())
                metadata = {
                    "attempt_id": data.attempt_id,
                    "question_id": data.question_id,
                    "evidence_tags": [
                        {
                            "tag_type": tag["tag_type"],
                            "tag_id": tag["tag_id"],
                            "tag_name": tag["tag_name"],
                            "role": tag["role"],
                            "weight": tag["weight"],
                            "confidence": tag["confidence"],
                        }
                        for tag in tags
                    ],
                }
                connection.execute(
                    """
                    INSERT INTO review_event(
                        id, user_id, session_id, schedule_id, review_type,
                        target_type, target_id, target_name, result, score,
                        created_at, metadata_json, client_event_id
                    ) VALUES (?, ?, ?, ?, 'old_question_review', ?, ?, ?,
                              ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        data.user_id,
                        data.session_id,
                        data.schedule_id,
                        schedule["target_type"],
                        schedule["target_id"],
                        schedule["target_name"],
                        outcome,
                        {"success": 1.0, "partial": 0.5, "fail": 0.0}[outcome],
                        now,
                        dumps(metadata),
                        data.client_event_id,
                    ),
                )
                review = connection.execute(
                    "SELECT * FROM review_event WHERE id = ?", (event_id,)
                ).fetchone()
                candidates = self._review_candidates(connection, review)
        except sqlite3.IntegrityError as exc:
            self.state._handle_integrity(exc)
        return {
            "result": {
                "review_event_id": event_id,
                "pending_state_deltas": candidates,
                "idempotent": False,
            },
            "meta": self._meta(
                context,
                "ok",
                "复习事实和待验证状态变化已原子写入",
            ),
        }

    def _review_candidates(
        self, connection: sqlite3.Connection, review: Mapping[str, Any]
    ) -> list[dict[str, Any]]:
        metadata = loads(review["metadata_json"], {})
        tags = metadata.get("evidence_tags", []) if isinstance(metadata, dict) else []
        if not isinstance(tags, list):
            tags = []
        target_type = review["target_type"]
        target_id = review["target_id"]
        if target_type == "knowledge_point" and target_id:
            contract_target_type = "knowledge_mastery"
        elif target_type == "method" and target_id:
            contract_target_type = "method_mastery"
        elif target_type == "error_pattern":
            contract_target_type = "error_pattern"
            target_id = target_id or review["id"]
        else:
            first_tag = next(
                (
                    tag
                    for tag in tags
                    if tag.get("tag_type") in {"knowledge_point", "method"}
                    and tag.get("tag_id")
                ),
                None,
            )
            if first_tag is None:
                contract_target_type = "review_schedule"
                target_id = review["schedule_id"] or review["id"]
            else:
                target_type = first_tag["tag_type"]
                target_id = first_tag["tag_id"]
                contract_target_type = (
                    "knowledge_mastery"
                    if target_type == "knowledge_point"
                    else "method_mastery"
                )
        attempt_id = metadata.get("attempt_id")
        question_id = metadata.get("question_id") or review["target_id"] or review["id"]
        knowledge_ids = [
            tag["tag_id"]
            for tag in tags
            if tag.get("tag_type") == "knowledge_point" and tag.get("tag_id")
        ]
        method_ids = [
            tag["tag_id"]
            for tag in tags
            if tag.get("tag_type") == "method" and tag.get("tag_id")
        ]
        judgement = {
            "success": "correct",
            "fail": "incorrect",
            "partial": "partial",
            "skipped": "ungraded",
        }[review["result"]]
        state_delta = {
            "target_type": contract_target_type,
            "target_id": target_id,
            "proposed_status": {
                "success": "stable",
                "partial": "reviewing",
                "fail": "weak",
                "skipped": "attempted",
            }[review["result"]],
            "reason": "SQLite 规则层根据真实复习事件生成",
            "evidence": {
                "question_id": question_id,
                **({"attempt_id": attempt_id} if attempt_id else {}),
                "review_event_id": review["id"],
                "judgement": judgement,
                "knowledge_point_ids": knowledge_ids,
                "method_ids": method_ids,
            },
        }
        pending = connection.execute(
            """
            SELECT * FROM pending_state_delta
            WHERE review_event_id = ? AND delta_type = 'mastery_update'
              AND validation_status IN ('pending', 'approved', 'applied')
            ORDER BY created_at DESC LIMIT 1
            """,
            (review["id"],),
        ).fetchone()
        if pending is None:
            delta_id = str(uuid4())
            payload = {
                "action": "apply_review",
                "review_event_id": review["id"],
                "requested_entity_type": target_type,
                "requested_entity_id": target_id,
                "requested_entity_name": review["target_name"],
                "entity_type": target_type,
                "entity_id": target_id,
                "entity_name": review["target_name"],
                "evidence": state_delta["evidence"],
            }
            connection.execute(
                """
                INSERT INTO pending_state_delta(
                    id, user_id, session_id, review_event_id, delta_type,
                    proposed_by, delta_json, validation_status, created_at
                ) VALUES (?, ?, ?, ?, 'mastery_update', 'rule', ?,
                          'pending', ?)
                """,
                (
                    delta_id,
                    review["user_id"],
                    review["session_id"],
                    review["id"],
                    dumps(payload),
                    sqlite_timestamp(),
                ),
            )
        else:
            delta_id = pending["id"]
        return [
            {
                "pending_state_delta_id": delta_id,
                "state_delta": state_delta,
            }
        ]

    def _candidate_for_delta(
        self, connection: sqlite3.Connection, delta: Mapping[str, Any]
    ) -> dict[str, Any] | None:
        if delta["attempt_id"]:
            attempt = connection.execute(
                "SELECT * FROM question_attempt WHERE id = ?", (delta["attempt_id"],)
            ).fetchone()
            candidates = self._attempt_candidates(connection, attempt)
        elif delta["review_event_id"]:
            review = connection.execute(
                "SELECT * FROM review_event WHERE id = ?",
                (delta["review_event_id"],),
            ).fetchone()
            candidates = self._review_candidates(connection, review)
        else:
            return None
        return next(
            (
                candidate
                for candidate in candidates
                if candidate["pending_state_delta_id"] == delta["id"]
            ),
            None,
        )

    def _apply_state_delta(
        self, data: ApplyStateDeltaInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        try:
            with self.database.transaction() as connection:
                delta = connection.execute(
                    """
                    SELECT * FROM pending_state_delta
                    WHERE id = ? AND user_id = ? AND session_id = ?
                    """,
                    (
                        data.pending_state_delta_id,
                        data.user_id,
                        data.session_id,
                    ),
                ).fetchone()
                if delta is None:
                    raise DomainValidationError(
                        "pending_state_delta does not belong to current user/session"
                    )
                expected = self._candidate_for_delta(connection, delta)
                if expected is None:
                    raise DomainValidationError(
                        "pending_state_delta has no verifiable fact candidate"
                    )
                supplied = data.state_delta.model_dump(exclude_none=True)
                if expected["state_delta"] != supplied:
                    raise DomainValidationError(
                        "state_delta does not match the database fact candidate"
                    )
                existing_event = delta["apply_client_event_id"]
                if (
                    existing_event is not None
                    and existing_event != data.client_event_id
                ):
                    raise ConflictError(
                        "pending_state_delta was already bound to another apply event"
                    )
                connection.execute(
                    """
                    UPDATE pending_state_delta
                    SET apply_client_event_id = COALESCE(
                        apply_client_event_id, ?
                    )
                    WHERE id = ?
                    """,
                    (data.client_event_id, data.pending_state_delta_id),
                )
        except sqlite3.IntegrityError as exc:
            self.state._handle_integrity(exc)
        self.state.validate_and_apply_delta(data.pending_state_delta_id)
        applied = self.state.get_pending_delta(data.pending_state_delta_id)
        status = applied["validation_status"]
        return {
            "result": {
                "pending_state_delta_id": data.pending_state_delta_id,
                "status": status,
                "validation_reason": applied.get("validation_reason"),
                "applied_at": applied.get("applied_at"),
            },
            "meta": self._meta(
                context,
                "ok",
                f"状态变化处理结果：{status}",
            ),
        }

    def _write_agent_event(
        self, data: WriteAgentEventInput, context: ToolRequestContext
    ) -> dict[str, Any]:
        event_id = str(uuid4())
        try:
            with self.database.transaction() as connection:
                self._ensure_scope(connection, data.user_id, data.session_id)
                workflow = connection.execute(
                    "SELECT * FROM workflow_run WHERE id = ?",
                    (data.workflow_run_id,),
                ).fetchone()
                if workflow is None:
                    connection.execute(
                        """
                        INSERT INTO workflow_run(
                            id, user_id, session_id, workflow_name, status,
                            input_json, output_json, current_step, started_at,
                            metadata_json
                        ) VALUES (?, ?, ?, 'local_agent', 'running', '{}', '{}',
                                  ?, ?, '{}')
                        """,
                        (
                            data.workflow_run_id,
                            data.user_id,
                            data.session_id,
                            data.event_type,
                            sqlite_timestamp(),
                        ),
                    )
                elif (
                    workflow["user_id"] != data.user_id
                    or workflow["session_id"] != data.session_id
                ):
                    raise DomainValidationError("workflow_user_mismatch")
                connection.execute(
                    """
                    INSERT INTO local_event_log(
                        id, user_id, session_id, event_type, aggregate_type,
                        aggregate_id, event_json, created_at
                    ) VALUES (?, ?, ?, ?, 'workflow', ?, ?, ?)
                    """,
                    (
                        event_id,
                        data.user_id,
                        data.session_id,
                        data.event_type,
                        data.workflow_run_id,
                        dumps(
                            {
                                "summary": data.summary,
                                "references": data.references.model_dump(),
                            }
                        ),
                        sqlite_timestamp(),
                    ),
                )
                connection.execute(
                    """
                    UPDATE workflow_run
                    SET current_step = ?,
                        status = CASE
                            WHEN ? = 'output_ready' THEN 'succeeded'
                            ELSE status
                        END,
                        completed_at = CASE
                            WHEN ? = 'output_ready' THEN ?
                            ELSE completed_at
                        END
                    WHERE id = ?
                    """,
                    (
                        data.event_type,
                        data.event_type,
                        data.event_type,
                        sqlite_timestamp(),
                        data.workflow_run_id,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            self.state._handle_integrity(exc)
        return {
            "result": {"event_id": event_id},
            "meta": self._meta(context, "ok", "Agent 事件已写入本地审计日志"),
        }
