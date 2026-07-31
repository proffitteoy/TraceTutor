from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping
from uuid import uuid4

from tracetutor_state.db import Database
from tracetutor_state.errors import DomainValidationError, NotFoundError
from tracetutor_state.json_utils import decode_mapping, decode_rows, dumps, loads
from tracetutor_state.schemas import (
    ActiveContextStatusUpdate,
    ActiveContextUpsert,
    AttemptCheck,
    AttemptCreate,
    AttemptTagsAttach,
    ContextSummaryWrite,
    MemoryCreate,
    MemoryUpdate,
    PendingDeltaCreate,
    ReviewEventCreate,
    SessionCreate,
    SessionUpdate,
    TurnCreate,
    UserCreate,
    UserUpdate,
)
from tracetutor_state.services.asset_validator import (
    AssetReferenceValidator,
    NoopAssetReferenceValidator,
)
from tracetutor_state.services.config_service import ConfigService
from tracetutor_state.services.state_base import (
    MASTERY_ENTITY_TYPES,
    REVIEW_TARGET_TYPES,
    StateBaseMixin,
)
from tracetutor_state.services.state_rules import (
    DiversityEvidence,
    RuleConfig,
    calculate_priority,
    classify_state,
    parse_sqlite_timestamp,
    sqlite_timestamp,
    update_error_pattern,
    update_mastery,
    update_review_schedule,
)


class StateService(StateBaseMixin):
    """SQLite-backed user learning state machine.

    Facts are written first. Formal state is changed only by deterministic rules
    after a verifiable attempt/review fact has passed the pending-state gate.
    """

    def __init__(
        self,
        database: Database,
        asset_validator: AssetReferenceValidator | None = None,
    ) -> None:
        self.database = database
        self.asset_validator = asset_validator or NoopAssetReferenceValidator()
        self.config_service = ConfigService(database)

    # ------------------------------------------------------------------
    # Users, sessions, turns, and attempt facts
    # ------------------------------------------------------------------
    def create_user(self, data: UserCreate) -> dict[str, Any]:
        user_id = self._new_id(data.user_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO user_profile(
                        user_id, display_name, current_subject, current_stage,
                        preference_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        data.display_name,
                        data.current_subject,
                        data.current_stage,
                        dumps(data.preferences),
                        now,
                        now,
                    ),
                )
                row = connection.execute(
                    "SELECT * FROM user_profile WHERE user_id = ?", (user_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def get_user(self, user_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM user_profile WHERE user_id = ?", (user_id,)
            ).fetchone()
        return decode_mapping(self._require(row, "user")) or {}

    def update_user(self, user_id: str, data: UserUpdate) -> dict[str, Any]:
        fields: list[str] = []
        values: list[Any] = []
        mapping = {
            "display_name": data.display_name,
            "current_subject": data.current_subject,
            "current_stage": data.current_stage,
        }
        for field, value in mapping.items():
            if value is not None:
                fields.append(f"{field} = ?")
                values.append(value)
        if data.preferences is not None:
            fields.append("preference_json = ?")
            values.append(dumps(data.preferences))
        if not fields:
            return self.get_user(user_id)
        fields.append("updated_at = ?")
        values.append(sqlite_timestamp())
        values.append(user_id)
        with self.database.transaction() as connection:
            cursor = connection.execute(
                f"UPDATE user_profile SET {', '.join(fields)} WHERE user_id = ?",
                values,
            )
            if cursor.rowcount == 0:
                raise NotFoundError("user not found")
            row = connection.execute(
                "SELECT * FROM user_profile WHERE user_id = ?", (user_id,)
            ).fetchone()
        return decode_mapping(row) or {}

    def create_session(self, data: SessionCreate) -> dict[str, Any]:
        session_id = self._new_id(data.session_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO learning_session(
                        id, user_id, session_type, subject, topic, status,
                        started_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
                    """,
                    (
                        session_id,
                        data.user_id,
                        data.session_type,
                        data.subject,
                        data.topic,
                        now,
                        dumps(data.metadata),
                    ),
                )
                self._write_local_event(
                    connection,
                    user_id=data.user_id,
                    session_id=session_id,
                    event_type="session_created",
                    aggregate_type="session",
                    aggregate_id=session_id,
                    payload={"session_type": data.session_type, "topic": data.topic},
                )
                row = connection.execute(
                    "SELECT * FROM learning_session WHERE id = ?", (session_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def get_session(self, session_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM learning_session WHERE id = ?", (session_id,)
            ).fetchone()
        return decode_mapping(self._require(row, "session")) or {}

    def list_sessions(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM learning_session WHERE user_id = ?"
        params: list[Any] = [user_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def update_session(self, session_id: str, data: SessionUpdate) -> dict[str, Any]:
        fields: list[str] = []
        values: list[Any] = []
        if data.status is not None:
            fields.append("status = ?")
            values.append(data.status)
            if data.status in {"completed", "interrupted", "failed"}:
                fields.append("ended_at = ?")
                values.append(sqlite_timestamp())
        for field, value in (("summary_text", data.summary_text), ("subject", data.subject), ("topic", data.topic)):
            if value is not None:
                fields.append(f"{field} = ?")
                values.append(value)
        if data.metadata is not None:
            fields.append("metadata_json = ?")
            values.append(dumps(data.metadata))
        if not fields:
            return self.get_session(session_id)
        values.append(session_id)
        with self.database.transaction() as connection:
            cursor = connection.execute(
                f"UPDATE learning_session SET {', '.join(fields)} WHERE id = ?",
                values,
            )
            if cursor.rowcount == 0:
                raise NotFoundError("session not found")
            row = connection.execute(
                "SELECT * FROM learning_session WHERE id = ?", (session_id,)
            ).fetchone()
        return decode_mapping(row) or {}

    def write_turn(self, data: TurnCreate) -> dict[str, Any]:
        turn_id = self._new_id(data.turn_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO conversation_turn(
                        id, session_id, user_id, role, content_text, content_type,
                        token_estimate, related_question_id, related_attempt_id,
                        created_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        turn_id,
                        data.session_id,
                        data.user_id,
                        data.role,
                        data.content_text,
                        data.content_type,
                        data.token_estimate,
                        data.related_question_id,
                        data.related_attempt_id,
                        now,
                        dumps(data.metadata),
                    ),
                )
                row = connection.execute(
                    "SELECT * FROM conversation_turn WHERE id = ?", (turn_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def list_turns(
        self,
        session_id: str,
        limit: int = 100,
        newest_first: bool = False,
    ) -> list[dict[str, Any]]:
        direction = "DESC" if newest_first else "ASC"
        with self.database.read() as connection:
            rows = connection.execute(
                f"SELECT * FROM conversation_turn WHERE session_id = ? ORDER BY created_at {direction} LIMIT ?",
                (session_id, limit),
            ).fetchall()
        return decode_rows(rows)

    def write_attempt(self, data: AttemptCreate) -> dict[str, Any]:
        self.asset_validator.validate_question_id(data.question_id)
        attempt_id = self._new_id(data.attempt_id)
        now = sqlite_timestamp()
        checked_at = now if data.is_correct is not None or data.score is not None else None
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO question_attempt(
                        id, user_id, session_id, question_id, source_type,
                        user_answer_text, is_correct, score, attempt_status,
                        time_spent_seconds, difficulty_level, main_error_type,
                        error_detail_text, confidence_self_report, created_at,
                        checked_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        attempt_id,
                        data.user_id,
                        data.session_id,
                        data.question_id,
                        data.source_type,
                        data.user_answer_text,
                        None if data.is_correct is None else int(data.is_correct),
                        data.score,
                        data.attempt_status,
                        data.time_spent_seconds,
                        data.difficulty_level,
                        data.main_error_type,
                        data.error_detail_text,
                        data.confidence_self_report,
                        now,
                        checked_at,
                        dumps(data.metadata),
                    ),
                )
                self._write_local_event(
                    connection,
                    user_id=data.user_id,
                    session_id=data.session_id,
                    event_type="attempt_created",
                    aggregate_type="attempt",
                    aggregate_id=attempt_id,
                    payload={
                        "question_id": data.question_id,
                        "source_type": data.source_type,
                        "attempt_status": data.attempt_status,
                    },
                )
                row = connection.execute(
                    "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def check_attempt(self, attempt_id: str, data: AttemptCheck) -> dict[str, Any]:
        fields: list[str] = []
        values: list[Any] = []
        simple = {
            "user_answer_text": data.user_answer_text,
            "score": data.score,
            "attempt_status": data.attempt_status,
            "time_spent_seconds": data.time_spent_seconds,
            "difficulty_level": data.difficulty_level,
            "main_error_type": data.main_error_type,
            "error_detail_text": data.error_detail_text,
            "confidence_self_report": data.confidence_self_report,
        }
        for field, value in simple.items():
            if value is not None:
                fields.append(f"{field} = ?")
                values.append(value)
        if data.is_correct is not None:
            fields.append("is_correct = ?")
            values.append(int(data.is_correct))
        if data.metadata is not None:
            fields.append("metadata_json = ?")
            values.append(dumps(data.metadata))
        if data.is_correct is not None or data.score is not None:
            fields.append("checked_at = ?")
            values.append(sqlite_timestamp())
            if data.attempt_status is None:
                fields.append("attempt_status = 'checked'")
        if not fields:
            return self.get_attempt(attempt_id)
        values.append(attempt_id)
        with self.database.transaction() as connection:
            current = self._require(
                connection.execute(
                    "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
                ).fetchone(),
                "attempt",
            )
            if current["state_applied_at"]:
                raise DomainValidationError(
                    "attempt grading cannot be changed after formal state has been applied"
                )
            connection.execute(
                f"UPDATE question_attempt SET {', '.join(fields)} WHERE id = ?",
                values,
            )
            row = connection.execute(
                "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
            ).fetchone()
        return self.get_attempt(attempt_id)

    def get_attempt(self, attempt_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
            ).fetchone()
            tags = connection.execute(
                "SELECT * FROM question_attempt_tag WHERE attempt_id = ? ORDER BY tag_type, role",
                (attempt_id,),
            ).fetchall()
        result = decode_mapping(self._require(row, "attempt")) or {}
        result["tags"] = decode_rows(tags)
        return result

    def list_attempts(
        self,
        user_id: str,
        *,
        question_id: str | None = None,
        is_correct: bool | None = None,
        tag_type: str | None = None,
        tag_name: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT DISTINCT a.*
            FROM question_attempt a
            LEFT JOIN question_attempt_tag t ON t.attempt_id = a.id
            WHERE a.user_id = ?
        """
        params: list[Any] = [user_id]
        if question_id:
            query += " AND a.question_id = ?"
            params.append(question_id)
        if is_correct is not None:
            query += " AND a.is_correct = ?"
            params.append(int(is_correct))
        if tag_type:
            query += " AND t.tag_type = ?"
            params.append(tag_type)
        if tag_name:
            query += " AND t.tag_name = ?"
            params.append(tag_name)
        query += " ORDER BY a.created_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
            return self._attempts_with_tags(connection, rows)

    def attach_attempt_tags(
        self, attempt_id: str, data: AttemptTagsAttach
    ) -> list[dict[str, Any]]:
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                attempt = self._require(
                    connection.execute(
                        "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
                    ).fetchone(),
                    "attempt",
                )
                if attempt["state_applied_at"]:
                    raise DomainValidationError(
                        "tag snapshot cannot be changed after formal state has been applied"
                    )
                config = self._rule_config(
                    connection, attempt["user_id"], attempt["session_id"]
                )
                for tag in data.tags:
                    if tag.tag_id:
                        self.asset_validator.validate_tag_id(tag.tag_type, tag.tag_id)
                    weight = (
                        float(tag.weight)
                        if tag.weight is not None
                        else config.default_tag_weight(tag.tag_type, tag.role)
                    )
                    connection.execute(
                        """
                        INSERT INTO question_attempt_tag(
                            id, attempt_id, tag_type, tag_id, tag_name, role,
                            weight, confidence, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(attempt_id, tag_type, tag_name, role)
                        DO UPDATE SET tag_id = excluded.tag_id,
                                      weight = excluded.weight,
                                      confidence = excluded.confidence
                        """,
                        (
                            str(uuid4()),
                            attempt_id,
                            tag.tag_type,
                            tag.tag_id,
                            tag.tag_name,
                            tag.role,
                            weight,
                            tag.confidence,
                            now,
                        ),
                    )
                rows = connection.execute(
                    "SELECT * FROM question_attempt_tag WHERE attempt_id = ? ORDER BY tag_type, role",
                    (attempt_id,),
                ).fetchall()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_rows(rows)

    # ------------------------------------------------------------------
    # Deterministic learning-state engine
    # ------------------------------------------------------------------
    def apply_attempt_state(self, attempt_id: str) -> dict[str, Any]:
        with self.database.transaction() as connection:
            attempt = self._require(
                connection.execute(
                    "SELECT * FROM question_attempt WHERE id = ?", (attempt_id,)
                ).fetchone(),
                "attempt",
            )
            if attempt["state_applied_at"]:
                delta = connection.execute(
                    """
                    SELECT * FROM pending_state_delta
                    WHERE attempt_id = ? AND delta_type = 'mastery_update'
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (attempt_id,),
                ).fetchone()
                return {
                    "idempotent": True,
                    "attempt_id": attempt_id,
                    "state_applied_at": attempt["state_applied_at"],
                    "delta": decode_mapping(delta),
                }
            tags = connection.execute(
                "SELECT * FROM question_attempt_tag WHERE attempt_id = ? ORDER BY role, tag_type",
                (attempt_id,),
            ).fetchall()
            try:
                self._validate_attempt_evidence(attempt, tags)
            except DomainValidationError as exc:
                raise DomainValidationError(str(exc)) from exc

            existing = connection.execute(
                """
                SELECT * FROM pending_state_delta
                WHERE attempt_id = ? AND delta_type = 'mastery_update'
                  AND validation_status IN ('pending', 'approved', 'applied')
                ORDER BY created_at DESC LIMIT 1
                """,
                (attempt_id,),
            ).fetchone()
            delta_id = existing["id"] if existing else str(uuid4())
            now = sqlite_timestamp()
            if existing is None:
                connection.execute(
                    """
                    INSERT INTO pending_state_delta(
                        id, user_id, session_id, attempt_id, delta_type,
                        proposed_by, delta_json, validation_status, created_at
                    ) VALUES (?, ?, ?, ?, 'mastery_update', 'rule', ?, 'pending', ?)
                    """,
                    (
                        delta_id,
                        attempt["user_id"],
                        attempt["session_id"],
                        attempt_id,
                        dumps({"action": "apply_attempt", "attempt_id": attempt_id}),
                        now,
                    ),
                )
            connection.execute(
                """
                UPDATE pending_state_delta
                SET validation_status = 'approved',
                    validation_reason = 'checked attempt, question reference and tag snapshot verified',
                    validated_at = ?
                WHERE id = ?
                """,
                (now, delta_id),
            )
            return self._apply_attempt_in_connection(
                connection, attempt=attempt, tags=tags, delta_id=delta_id
            )

    def _apply_attempt_in_connection(
        self,
        connection: sqlite3.Connection,
        *,
        attempt: Mapping[str, Any],
        tags: Iterable[Mapping[str, Any]],
        delta_id: str,
    ) -> dict[str, Any]:
        if attempt["state_applied_at"]:
            return {
                "idempotent": True,
                "attempt_id": attempt["id"],
                "state_applied_at": attempt["state_applied_at"],
                "delta_id": delta_id,
            }
        tag_list = list(tags)
        self._validate_attempt_evidence(attempt, tag_list)
        result_name = self._attempt_result(attempt)
        now = sqlite_timestamp()
        updates: list[dict[str, Any]] = []
        if result_name != "skipped":
            for tag in tag_list:
                updates.append(
                    self._transition_entity(
                        connection,
                        user_id=attempt["user_id"],
                        session_id=attempt["session_id"],
                        entity_type=tag["tag_type"],
                        entity_id=tag["tag_id"],
                        entity_name=tag["tag_name"],
                        result=result_name,
                        weight=float(tag["weight"]) * float(tag["confidence"]),
                        evidence_text=(
                            f"attempt_id={attempt['id']}; question_id={attempt['question_id']}; "
                            f"result={result_name}"
                        ),
                        attempt_id=attempt["id"],
                        review_event_id=None,
                        is_review=False,
                        now=now,
                    )
                )

        error_updates: list[dict[str, Any]] = []
        if result_name == "fail":
            error_updates.append(
                self._upsert_error_pattern_from_attempt(
                    connection, attempt=attempt, tags=tag_list, now=now
                )
            )
        elif result_name in {"success", "partial"}:
            error_updates.extend(
                self._improve_related_errors(
                    connection,
                    user_id=attempt["user_id"],
                    tags=tag_list,
                    result=result_name,
                    now=now,
                )
            )

        connection.execute(
            """
            UPDATE question_attempt
            SET state_applied_at = ?, attempt_status = 'checked',
                checked_at = COALESCE(checked_at, ?)
            WHERE id = ?
            """,
            (now, now, attempt["id"]),
        )
        connection.execute(
            """
            UPDATE pending_state_delta
            SET validation_status = 'applied', applied_at = ?,
                validation_reason = COALESCE(
                    validation_reason,
                    'deterministic attempt rules applied'
                )
            WHERE id = ?
            """,
            (now, delta_id),
        )
        self._write_evidence_summary_and_memory(
            connection,
            user_id=attempt["user_id"],
            session_id=attempt["session_id"],
            result=result_name,
            source_type="attempt",
            source_id=attempt["id"],
            tags=tag_list,
            error_text=attempt["error_detail_text"],
            now=now,
        )
        self._write_local_event(
            connection,
            user_id=attempt["user_id"],
            session_id=attempt["session_id"],
            event_type="attempt_state_applied",
            aggregate_type="attempt",
            aggregate_id=attempt["id"],
            payload={
                "delta_id": delta_id,
                "result": result_name,
                "updated_entities": [item["entity_name"] for item in updates],
                "error_updates": [item.get("id") for item in error_updates],
            },
        )
        return {
            "idempotent": False,
            "attempt_id": attempt["id"],
            "delta_id": delta_id,
            "validation_status": "applied",
            "result": result_name,
            "mastery_updates": updates,
            "error_pattern_updates": error_updates,
            "error_pattern_update": error_updates[0] if error_updates else None,
        }

    def _transition_entity(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        session_id: str | None,
        entity_type: str,
        entity_id: str | None,
        entity_name: str,
        result: str,
        weight: float,
        evidence_text: str,
        attempt_id: str | None,
        review_event_id: str | None,
        is_review: bool,
        now: str,
    ) -> dict[str, Any]:
        if entity_type not in MASTERY_ENTITY_TYPES:
            raise DomainValidationError(f"unsupported mastery entity_type: {entity_type}")
        config = self._rule_config(connection, user_id, session_id)
        current = connection.execute(
            """
            SELECT * FROM mastery_state
            WHERE user_id = ? AND entity_type = ? AND entity_name = ?
            """,
            (user_id, entity_type, entity_name),
        ).fetchone()
        old_mastery = (
            float(current["mastery_score"])
            if current
            else config.initial_mastery_prior
        )
        old_confidence = (
            float(current["confidence_score"])
            if current
            else config.initial_confidence_prior
        )
        old_recent = (
            float(current["recent_score"])
            if current and current["recent_score"] is not None
            else None
        )
        old_exposure = int(current["exposure_count"]) if current else 0
        old_correct = int(current["correct_count"]) if current else 0
        old_wrong = int(current["wrong_count"]) if current else 0
        old_label = current["state_label"] if current else "unseen"
        exposure = old_exposure + (0 if result == "skipped" else 1)
        correct_count = old_correct + (1 if result == "success" else 0)
        wrong_count = old_wrong + (1 if result == "fail" else 0)
        diversity = self._diversity_evidence(
            connection, user_id, entity_type, entity_name
        )
        transition = update_mastery(
            old_mastery=old_mastery,
            old_confidence=old_confidence,
            old_recent_score=old_recent,
            exposure_count_after=exposure,
            result=result,
            weight=weight,
            diversity=diversity,
            config=config,
        )
        mastery_change = transition.mastery_score - old_mastery
        confidence_change = transition.confidence_score - old_confidence
        if abs(mastery_change) > config.max_mastery_change_per_event + 1e-9:
            raise DomainValidationError("computed mastery change exceeds configured safety range")
        if abs(confidence_change) > config.max_confidence_change_per_event + 1e-9:
            raise DomainValidationError("computed confidence change exceeds configured safety range")

        schedule = connection.execute(
            """
            SELECT * FROM review_schedule
            WHERE user_id = ? AND target_type = ? AND target_name = ?
            """,
            (user_id, entity_type, entity_name),
        ).fetchone()
        severity = self._related_error_severity(
            connection, user_id, entity_type, entity_name
        )
        if result == "fail":
            severity = max(severity, 1.0)
        elif result == "partial":
            severity = max(severity, 0.5)
        review_transition = update_review_schedule(
            old_interval_days=float(schedule["interval_days"]) if schedule else None,
            old_ease_factor=float(schedule["ease_factor"]) if schedule else None,
            result=result,
            mastery_score=transition.mastery_score,
            severity_score=severity,
            importance_score=min(1.0, max(0.0, weight)),
            config=config,
        )
        if schedule and abs(
            review_transition.priority_score - float(schedule["priority_score"])
        ) > config.max_priority_change_per_event + 1e-9:
            # Clamp rather than discard the whole verifiable state update.
            direction = 1 if review_transition.priority_score >= float(schedule["priority_score"]) else -1
            capped_priority = max(
                0.0,
                min(
                    1.0,
                    float(schedule["priority_score"])
                    + direction * config.max_priority_change_per_event,
                ),
            )
        else:
            capped_priority = review_transition.priority_score

        state_id = current["id"] if current else str(uuid4())
        last_success = (
            now if result == "success" else (current["last_success_at"] if current else None)
        )
        last_failure = (
            now if result == "fail" else (current["last_failure_at"] if current else None)
        )
        if current:
            connection.execute(
                """
                UPDATE mastery_state
                SET entity_id = COALESCE(?, entity_id), mastery_score = ?,
                    confidence_score = ?, exposure_count = ?, correct_count = ?,
                    wrong_count = ?, recent_score = ?, state_label = ?,
                    last_seen_at = ?, last_success_at = ?, last_failure_at = ?,
                    next_review_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    entity_id,
                    transition.mastery_score,
                    transition.confidence_score,
                    exposure,
                    correct_count,
                    wrong_count,
                    transition.recent_score,
                    transition.state_label,
                    now,
                    last_success,
                    last_failure,
                    review_transition.due_at,
                    now,
                    state_id,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO mastery_state(
                    id, user_id, entity_type, entity_id, entity_name,
                    mastery_score, confidence_score, exposure_count,
                    correct_count, wrong_count, recent_score, state_label,
                    last_seen_at, last_success_at, last_failure_at,
                    next_review_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    state_id,
                    user_id,
                    entity_type,
                    entity_id,
                    entity_name,
                    transition.mastery_score,
                    transition.confidence_score,
                    exposure,
                    correct_count,
                    wrong_count,
                    transition.recent_score,
                    transition.state_label,
                    now,
                    last_success,
                    last_failure,
                    review_transition.due_at,
                    now,
                ),
            )

        schedule_result = self._upsert_review_schedule(
            connection,
            user_id=user_id,
            session_id=session_id,
            target_type=entity_type,
            target_id=entity_id,
            target_name=entity_name,
            result=result,
            transition=review_transition,
            priority_score=capped_priority,
            is_review=is_review,
            evidence={
                "attempt_id": attempt_id,
                "review_event_id": review_event_id,
                "mastery_state_id": state_id,
                "priority_formula": "0.35*weakness + 0.25*severity + 0.25*due + 0.15*importance",
                "priority_components": review_transition.priority_components,
            },
            now=now,
        )

        delta_reason = {
            (False, "success"): "correct_answer",
            (False, "fail"): "wrong_answer",
            (False, "partial"): "partial_answer",
            (True, "success"): "review_success",
            (True, "fail"): "review_failed",
            (True, "partial"): "review_partial",
        }.get((is_review, result))
        event_id = None
        if delta_reason:
            event_id = str(uuid4())
            connection.execute(
                """
                INSERT INTO mastery_event(
                    id, user_id, mastery_state_id, attempt_id, review_event_id,
                    entity_type, entity_id, entity_name, old_mastery_score,
                    new_mastery_score, old_confidence_score, new_confidence_score,
                    old_state_label, new_state_label, delta_reason, evidence_text,
                    created_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    user_id,
                    state_id,
                    attempt_id,
                    review_event_id,
                    entity_type,
                    entity_id,
                    entity_name,
                    old_mastery,
                    transition.mastery_score,
                    old_confidence,
                    transition.confidence_score,
                    old_label,
                    transition.state_label,
                    delta_reason,
                    evidence_text,
                    now,
                    dumps(
                        {
                            "weight": weight,
                            "diversity": diversity.as_dict(),
                            "config": {
                                "alpha": config.alpha,
                                "beta": config.beta,
                                "mastered_score_threshold": config.mastered_score_threshold,
                                "mastered_confidence_threshold": config.mastered_confidence_threshold,
                            },
                        }
                    ),
                ),
            )
        self._write_local_event(
            connection,
            user_id=user_id,
            session_id=session_id,
            event_type="mastery_updated",
            aggregate_type="mastery",
            aggregate_id=state_id,
            payload={
                "entity_type": entity_type,
                "entity_name": entity_name,
                "old_mastery_score": old_mastery,
                "new_mastery_score": transition.mastery_score,
                "old_confidence_score": old_confidence,
                "new_confidence_score": transition.confidence_score,
                "state_label": transition.state_label,
                "diversity": diversity.as_dict(),
                "reason": result,
            },
        )
        return {
            "mastery_state_id": state_id,
            "mastery_event_id": event_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "old_mastery_score": old_mastery,
            "new_mastery_score": transition.mastery_score,
            "old_confidence_score": old_confidence,
            "new_confidence_score": transition.confidence_score,
            "old_state_label": old_label,
            "new_state_label": transition.state_label,
            "diversity": diversity.as_dict(),
            "next_review_at": review_transition.due_at,
            "review_schedule": schedule_result,
        }

    def _upsert_review_schedule(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        session_id: str | None,
        target_type: str,
        target_id: str | None,
        target_name: str,
        result: str,
        transition: Any,
        priority_score: float,
        is_review: bool,
        evidence: dict[str, Any],
        now: str,
    ) -> dict[str, Any]:
        schedule = connection.execute(
            """
            SELECT * FROM review_schedule
            WHERE user_id = ? AND target_type = ? AND target_name = ?
            """,
            (user_id, target_type, target_name),
        ).fetchone()
        schedule_id = schedule["id"] if schedule else str(uuid4())
        metadata = {
            "reason": (
                "failure/partial evidence raised review urgency"
                if result in {"fail", "partial"}
                else "successful evidence increased the review interval"
            ),
            **evidence,
            "last_transition": {
                "result": result,
                "interval_days": transition.interval_days,
                "ease_factor": transition.ease_factor,
                "priority_score": priority_score,
            },
        }
        if schedule:
            connection.execute(
                """
                UPDATE review_schedule
                SET target_id = COALESCE(?, target_id), priority_score = ?,
                    due_at = ?, interval_days = ?, ease_factor = ?,
                    review_count = review_count + ?,
                    last_review_at = CASE WHEN ? = 1 THEN ? ELSE last_review_at END,
                    last_result = ?, status = 'scheduled', updated_at = ?,
                    metadata_json = ?
                WHERE id = ?
                """,
                (
                    target_id,
                    priority_score,
                    transition.due_at,
                    transition.interval_days,
                    transition.ease_factor,
                    1 if is_review else 0,
                    1 if is_review else 0,
                    now,
                    result,
                    now,
                    dumps(metadata),
                    schedule_id,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO review_schedule(
                    id, user_id, target_type, target_id, target_name,
                    priority_score, due_at, interval_days, ease_factor,
                    review_count, last_review_at, last_result, status,
                    created_at, updated_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
                """,
                (
                    schedule_id,
                    user_id,
                    target_type,
                    target_id,
                    target_name,
                    priority_score,
                    transition.due_at,
                    transition.interval_days,
                    transition.ease_factor,
                    1 if is_review else 0,
                    now if is_review else None,
                    result,
                    now,
                    now,
                    dumps(metadata),
                ),
            )
        self._write_local_event(
            connection,
            user_id=user_id,
            session_id=session_id,
            event_type="review_scheduled",
            aggregate_type="review",
            aggregate_id=schedule_id,
            payload={
                "target_type": target_type,
                "target_name": target_name,
                "due_at": transition.due_at,
                "priority_score": priority_score,
                "reason": metadata["reason"],
            },
        )
        row = connection.execute(
            "SELECT * FROM review_schedule WHERE id = ?", (schedule_id,)
        ).fetchone()
        return decode_mapping(row) or {}

    @staticmethod
    def _related_error_severity(
        connection: sqlite3.Connection,
        user_id: str,
        entity_type: str,
        entity_name: str,
    ) -> float:
        row = connection.execute(
            """
            SELECT COALESCE(MAX(severity_score), 0.0) AS severity
            FROM error_pattern_state
            WHERE user_id = ? AND related_entity_type = ?
              AND related_entity_name = ? AND status IN ('active', 'improving')
            """,
            (user_id, entity_type, entity_name),
        ).fetchone()
        return float(row["severity"] or 0.0)

    def _upsert_error_pattern_from_attempt(
        self,
        connection: sqlite3.Connection,
        *,
        attempt: Mapping[str, Any],
        tags: list[Mapping[str, Any]],
        now: str,
    ) -> dict[str, Any]:
        primary = next((tag for tag in tags if tag["role"] == "primary"), tags[0])
        error_type = attempt["main_error_type"] or "unknown"
        pattern_name = attempt["error_detail_text"] or error_type
        current = connection.execute(
            """
            SELECT * FROM error_pattern_state
            WHERE user_id = ? AND error_pattern_name = ?
              AND related_entity_name = ?
            """,
            (attempt["user_id"], pattern_name, primary["tag_name"]),
        ).fetchone()
        config = self._rule_config(
            connection, attempt["user_id"], attempt["session_id"]
        )
        transition = update_error_pattern(
            old_occurrence_count=int(current["occurrence_count"]) if current else 0,
            old_severity_score=float(current["severity_score"]) if current else 0.20,
            old_resolved_score=float(current["resolved_score"]) if current else 0.0,
            result="fail",
            config=config,
        )
        state_id = current["id"] if current else str(uuid4())
        if current:
            connection.execute(
                """
                UPDATE error_pattern_state
                SET error_type = ?, occurrence_count = ?, severity_score = ?,
                    last_occured_at = ?, resolved_score = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    error_type,
                    transition.occurrence_count,
                    transition.severity_score,
                    now,
                    transition.resolved_score,
                    transition.status,
                    now,
                    state_id,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO error_pattern_state(
                    id, user_id, error_type, error_pattern_name,
                    related_entity_type, related_entity_name, occurrence_count,
                    severity_score, last_occured_at, resolved_score, status,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    state_id,
                    attempt["user_id"],
                    error_type,
                    pattern_name,
                    primary["tag_type"],
                    primary["tag_name"],
                    transition.occurrence_count,
                    transition.severity_score,
                    now,
                    transition.resolved_score,
                    transition.status,
                    now,
                ),
            )
        self._write_local_event(
            connection,
            user_id=attempt["user_id"],
            session_id=attempt["session_id"],
            event_type="error_pattern_updated",
            aggregate_type="error_pattern",
            aggregate_id=state_id,
            payload={
                "error_pattern_name": pattern_name,
                "occurrence_count": transition.occurrence_count,
                "severity_score": transition.severity_score,
                "resolved_score": transition.resolved_score,
                "status": transition.status,
                "attempt_id": attempt["id"],
            },
        )
        row = connection.execute(
            "SELECT * FROM error_pattern_state WHERE id = ?", (state_id,)
        ).fetchone()
        return decode_mapping(row) or {}

    def _improve_related_errors(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        tags: list[Mapping[str, Any]],
        result: str,
        now: str,
    ) -> list[dict[str, Any]]:
        if result not in {"success", "partial"}:
            return []
        config = self._rule_config(connection, user_id, None)
        names = {str(tag["tag_name"]) for tag in tags}
        if not names:
            return []
        placeholders = ",".join("?" for _ in names)
        rows = connection.execute(
            f"""
            SELECT * FROM error_pattern_state
            WHERE user_id = ? AND related_entity_name IN ({placeholders})
              AND status IN ('active', 'improving')
            """,
            [user_id, *sorted(names)],
        ).fetchall()
        updates: list[dict[str, Any]] = []
        for current in rows:
            transition = update_error_pattern(
                old_occurrence_count=int(current["occurrence_count"]),
                old_severity_score=float(current["severity_score"]),
                old_resolved_score=float(current["resolved_score"]),
                result=result,
                config=config,
            )
            connection.execute(
                """
                UPDATE error_pattern_state
                SET severity_score = ?, resolved_score = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    transition.severity_score,
                    transition.resolved_score,
                    transition.status,
                    now,
                    current["id"],
                ),
            )
            updated = connection.execute(
                "SELECT * FROM error_pattern_state WHERE id = ?", (current["id"],)
            ).fetchone()
            updates.append(decode_mapping(updated) or {})
        return updates

    # ------------------------------------------------------------------
    # Review facts and review-state bundle
    # ------------------------------------------------------------------
    def write_review_event(self, data: ReviewEventCreate) -> dict[str, Any]:
        event_id = self._new_id(data.review_event_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                if data.schedule_id:
                    schedule = self._require(
                        connection.execute(
                            "SELECT * FROM review_schedule WHERE id = ?",
                            (data.schedule_id,),
                        ).fetchone(),
                        "review_schedule",
                    )
                    if schedule["user_id"] != data.user_id:
                        raise DomainValidationError("review_schedule_user_mismatch")
                    if (
                        schedule["target_type"] != data.target_type
                        or schedule["target_name"] != data.target_name
                        or (
                            schedule["target_id"]
                            and data.target_id
                            and schedule["target_id"] != data.target_id
                        )
                    ):
                        raise DomainValidationError("review_schedule_target_mismatch")
                tag_payload: list[dict[str, Any]] = []
                config = self._rule_config(connection, data.user_id, data.session_id)
                for tag in data.evidence_tags:
                    if tag.tag_id:
                        self.asset_validator.validate_tag_id(tag.tag_type, tag.tag_id)
                    tag_payload.append(
                        {
                            "tag_type": tag.tag_type,
                            "tag_id": tag.tag_id,
                            "tag_name": tag.tag_name,
                            "role": tag.role,
                            "weight": (
                                float(tag.weight)
                                if tag.weight is not None
                                else config.default_tag_weight(tag.tag_type, tag.role)
                            ),
                            "confidence": tag.confidence,
                        }
                    )
                metadata = dict(data.metadata)
                if tag_payload:
                    metadata["evidence_tags"] = tag_payload
                connection.execute(
                    """
                    INSERT INTO review_event(
                        id, user_id, session_id, schedule_id, review_type,
                        target_type, target_id, target_name, result, score,
                        user_feedback_text, agent_review_summary, created_at,
                        metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        data.user_id,
                        data.session_id,
                        data.schedule_id,
                        data.review_type,
                        data.target_type,
                        data.target_id,
                        data.target_name,
                        data.result,
                        data.score,
                        data.user_feedback_text,
                        data.agent_review_summary,
                        now,
                        dumps(metadata),
                    ),
                )
                delta_id = str(uuid4())
                connection.execute(
                    """
                    INSERT INTO pending_state_delta(
                        id, user_id, session_id, review_event_id, delta_type,
                        proposed_by, delta_json, validation_status,
                        validation_reason, created_at, validated_at
                    ) VALUES (?, ?, ?, ?, 'mastery_update', 'rule', ?,
                              'approved', 'recorded review fact verified', ?, ?)
                    """,
                    (
                        delta_id,
                        data.user_id,
                        data.session_id,
                        event_id,
                        dumps({"action": "apply_review", "review_event_id": event_id}),
                        now,
                        now,
                    ),
                )
                applied = self._apply_review_in_connection(
                    connection,
                    review_event=connection.execute(
                        "SELECT * FROM review_event WHERE id = ?", (event_id,)
                    ).fetchone(),
                    delta_id=delta_id,
                )
                return applied
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        raise AssertionError("unreachable")

    def _apply_review_in_connection(
        self,
        connection: sqlite3.Connection,
        *,
        review_event: Mapping[str, Any],
        delta_id: str,
    ) -> dict[str, Any]:
        if review_event["state_applied_at"]:
            row = connection.execute(
                "SELECT * FROM review_event WHERE id = ?", (review_event["id"],)
            ).fetchone()
            result = decode_mapping(row) or {}
            result.update({"idempotent": True, "delta_id": delta_id})
            return result
        result_name = review_event["result"]
        if result_name not in {"success", "fail", "partial", "skipped"}:
            raise DomainValidationError("review_event has no valid result")
        now = sqlite_timestamp()
        metadata = loads(review_event["metadata_json"], {})
        evidence_tags = metadata.get("evidence_tags", [])
        if not isinstance(evidence_tags, list):
            evidence_tags = []
        mastery_updates: list[dict[str, Any]] = []
        error_updates: list[dict[str, Any]] = []

        if review_event["target_type"] in MASTERY_ENTITY_TYPES and result_name != "skipped":
            mastery_updates.append(
                self._transition_entity(
                    connection,
                    user_id=review_event["user_id"],
                    session_id=review_event["session_id"],
                    entity_type=review_event["target_type"],
                    entity_id=review_event["target_id"],
                    entity_name=review_event["target_name"],
                    result=result_name,
                    weight=1.0,
                    evidence_text=(
                        f"review_event_id={review_event['id']}; result={result_name}"
                    ),
                    attempt_id=None,
                    review_event_id=review_event["id"],
                    is_review=True,
                    now=now,
                )
            )
        elif review_event["target_type"] == "question":
            if not evidence_tags and result_name != "skipped":
                raise DomainValidationError(
                    "question-level review requires evidence_tags to update mastery deterministically"
                )
            for tag in evidence_tags:
                if tag.get("tag_type") not in MASTERY_ENTITY_TYPES:
                    raise DomainValidationError("review evidence contains unsupported tag_type")
                if result_name != "skipped":
                    mastery_updates.append(
                        self._transition_entity(
                            connection,
                            user_id=review_event["user_id"],
                            session_id=review_event["session_id"],
                            entity_type=tag["tag_type"],
                            entity_id=tag.get("tag_id"),
                            entity_name=tag["tag_name"],
                            result=result_name,
                            weight=float(tag.get("weight", 1.0)) * float(tag.get("confidence", 1.0)),
                            evidence_text=(
                                f"review_event_id={review_event['id']}; "
                                f"question_id={review_event['target_id']}; result={result_name}"
                            ),
                            attempt_id=None,
                            review_event_id=review_event["id"],
                            is_review=True,
                            now=now,
                        )
                    )
        elif review_event["target_type"] == "error_pattern":
            error_updates.append(
                self._apply_error_review(
                    connection,
                    review_event=review_event,
                    result=result_name,
                    now=now,
                )
            )

        # Always keep/update a schedule for the explicit review target. For a
        # mastery entity, _transition_entity already updated that same schedule,
        # so reuse it to avoid double-incrementing review_count/interval.
        if review_event["target_type"] in MASTERY_ENTITY_TYPES and mastery_updates:
            target_schedule = mastery_updates[0]["review_schedule"]
        else:
            target_schedule = self._transition_explicit_review_schedule(
                connection, review_event=review_event, result=result_name, now=now
            )

        if result_name in {"success", "partial"}:
            related_tags: list[Mapping[str, Any]] = evidence_tags
            if review_event["target_type"] in MASTERY_ENTITY_TYPES:
                related_tags = [
                    {
                        "tag_type": review_event["target_type"],
                        "tag_name": review_event["target_name"],
                    }
                ]
            error_updates.extend(
                self._improve_related_errors(
                    connection,
                    user_id=review_event["user_id"],
                    tags=list(related_tags),
                    result=result_name,
                    now=now,
                )
            )

        next_review_at = target_schedule["due_at"]
        connection.execute(
            """
            UPDATE review_event
            SET next_review_at = ?, state_applied_at = ? WHERE id = ?
            """,
            (next_review_at, now, review_event["id"]),
        )
        connection.execute(
            """
            UPDATE pending_state_delta
            SET validation_status = 'applied', applied_at = ?,
                validation_reason = COALESCE(
                    validation_reason,
                    'deterministic review rules applied'
                )
            WHERE id = ?
            """,
            (now, delta_id),
        )
        summary_tags: list[Mapping[str, Any]] = evidence_tags
        if review_event["target_type"] in MASTERY_ENTITY_TYPES:
            summary_tags = [
                {
                    "tag_type": review_event["target_type"],
                    "tag_id": review_event["target_id"],
                    "tag_name": review_event["target_name"],
                    "role": "primary",
                }
            ]
        self._write_evidence_summary_and_memory(
            connection,
            user_id=review_event["user_id"],
            session_id=review_event["session_id"],
            result=result_name,
            source_type="review",
            source_id=review_event["id"],
            tags=list(summary_tags),
            error_text=None,
            now=now,
        )
        self._write_local_event(
            connection,
            user_id=review_event["user_id"],
            session_id=review_event["session_id"],
            event_type="review_recorded",
            aggregate_type="review",
            aggregate_id=review_event["id"],
            payload={
                "target_type": review_event["target_type"],
                "target_name": review_event["target_name"],
                "result": result_name,
                "delta_id": delta_id,
                "next_review_at": next_review_at,
            },
        )
        row = connection.execute(
            "SELECT * FROM review_event WHERE id = ?", (review_event["id"],)
        ).fetchone()
        result = decode_mapping(row) or {}
        result.update(
            {
                "idempotent": False,
                "delta_id": delta_id,
                "mastery_updates": mastery_updates,
                "error_pattern_updates": error_updates,
                "review_schedule": target_schedule,
            }
        )
        return result

    def _transition_explicit_review_schedule(
        self,
        connection: sqlite3.Connection,
        *,
        review_event: Mapping[str, Any],
        result: str,
        now: str,
    ) -> dict[str, Any]:
        schedule = None
        if review_event["schedule_id"]:
            schedule = connection.execute(
                "SELECT * FROM review_schedule WHERE id = ?",
                (review_event["schedule_id"],),
            ).fetchone()
        if schedule is None:
            schedule = connection.execute(
                """
                SELECT * FROM review_schedule
                WHERE user_id = ? AND target_type = ? AND target_name = ?
                """,
                (
                    review_event["user_id"],
                    review_event["target_type"],
                    review_event["target_name"],
                ),
            ).fetchone()
        config = self._rule_config(
            connection, review_event["user_id"], review_event["session_id"]
        )
        mastery_score = (
            float(review_event["score"])
            if review_event["score"] is not None
            else 0.5
        )
        if review_event["target_type"] in MASTERY_ENTITY_TYPES:
            mastery = connection.execute(
                """
                SELECT mastery_score FROM mastery_state
                WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                """,
                (
                    review_event["user_id"],
                    review_event["target_type"],
                    review_event["target_name"],
                ),
            ).fetchone()
            if mastery:
                mastery_score = float(mastery["mastery_score"])
        severity = 1.0 if result == "fail" else (0.5 if result == "partial" else 0.0)
        transition = update_review_schedule(
            old_interval_days=float(schedule["interval_days"]) if schedule else None,
            old_ease_factor=float(schedule["ease_factor"]) if schedule else None,
            result=result,
            mastery_score=mastery_score,
            severity_score=severity,
            importance_score=1.0,
            config=config,
        )
        return self._upsert_review_schedule(
            connection,
            user_id=review_event["user_id"],
            session_id=review_event["session_id"],
            target_type=review_event["target_type"],
            target_id=review_event["target_id"],
            target_name=review_event["target_name"],
            result=result,
            transition=transition,
            priority_score=transition.priority_score,
            is_review=True,
            evidence={
                "review_event_id": review_event["id"],
                "review_type": review_event["review_type"],
                "priority_components": transition.priority_components,
            },
            now=now,
        )

    def _apply_error_review(
        self,
        connection: sqlite3.Connection,
        *,
        review_event: Mapping[str, Any],
        result: str,
        now: str,
    ) -> dict[str, Any]:
        current = connection.execute(
            """
            SELECT * FROM error_pattern_state
            WHERE user_id = ? AND (
                id = ? OR error_pattern_name = ?
            ) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1
            """,
            (
                review_event["user_id"],
                review_event["target_id"],
                review_event["target_name"],
                review_event["target_id"],
            ),
        ).fetchone()
        if current is None:
            if result != "fail":
                raise DomainValidationError(
                    "error-pattern review target does not exist for a non-failure result"
                )
            state_id = str(uuid4())
            old_occurrence = 0
            old_severity = 0.2
            old_resolved = 0.0
            error_type = "unknown"
        else:
            state_id = current["id"]
            old_occurrence = int(current["occurrence_count"])
            old_severity = float(current["severity_score"])
            old_resolved = float(current["resolved_score"])
            error_type = current["error_type"]
        config = self._rule_config(
            connection, review_event["user_id"], review_event["session_id"]
        )
        transition = update_error_pattern(
            old_occurrence_count=old_occurrence,
            old_severity_score=old_severity,
            old_resolved_score=old_resolved,
            result=result,
            config=config,
        )
        if current:
            connection.execute(
                """
                UPDATE error_pattern_state
                SET occurrence_count = ?, severity_score = ?, resolved_score = ?,
                    status = ?, last_occured_at = CASE WHEN ? = 'fail' THEN ? ELSE last_occured_at END,
                    updated_at = ? WHERE id = ?
                """,
                (
                    transition.occurrence_count,
                    transition.severity_score,
                    transition.resolved_score,
                    transition.status,
                    result,
                    now,
                    now,
                    state_id,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO error_pattern_state(
                    id, user_id, error_type, error_pattern_name,
                    related_entity_type, related_entity_name, occurrence_count,
                    severity_score, last_occured_at, resolved_score, status, updated_at
                ) VALUES (?, ?, ?, ?, 'error_pattern', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    state_id,
                    review_event["user_id"],
                    error_type,
                    review_event["target_name"],
                    review_event["target_name"],
                    transition.occurrence_count,
                    transition.severity_score,
                    now,
                    transition.resolved_score,
                    transition.status,
                    now,
                ),
            )
        row = connection.execute(
            "SELECT * FROM error_pattern_state WHERE id = ?", (state_id,)
        ).fetchone()
        return decode_mapping(row) or {}

    def get_review_event(self, review_event_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM review_event WHERE id = ?", (review_event_id,)
            ).fetchone()
        return decode_mapping(self._require(row, "review_event")) or {}

    def query_review_history(
        self, user_id: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        with self.database.read() as connection:
            rows = connection.execute(
                """
                SELECT * FROM review_event
                WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return decode_rows(rows)

    # ------------------------------------------------------------------
    # Context summaries, retrievable memory, and active references
    # ------------------------------------------------------------------
    def write_context_summary(self, data: ContextSummaryWrite) -> dict[str, Any]:
        summary_id = self._new_id(data.summary_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    UPDATE context_summary
                    SET status = 'superseded', updated_at = ?
                    WHERE user_id = ?
                      AND ((session_id = ?) OR (session_id IS NULL AND ? IS NULL))
                      AND summary_scope = ? AND status = 'active'
                    """,
                    (
                        now,
                        data.user_id,
                        data.session_id,
                        data.session_id,
                        data.summary_scope,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO context_summary(
                        id, user_id, session_id, summary_scope, summary_text,
                        structured_json, source_turn_start_id, source_turn_end_id,
                        token_estimate, confidence, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                    """,
                    (
                        summary_id,
                        data.user_id,
                        data.session_id,
                        data.summary_scope,
                        data.summary_text,
                        dumps(data.structured),
                        data.source_turn_start_id,
                        data.source_turn_end_id,
                        data.token_estimate,
                        data.confidence,
                        now,
                        now,
                    ),
                )
                self._write_local_event(
                    connection,
                    user_id=data.user_id,
                    session_id=data.session_id,
                    event_type="context_summary_updated",
                    aggregate_type="context",
                    aggregate_id=summary_id,
                    payload={
                        "summary_scope": data.summary_scope,
                        "source_turn_start_id": data.source_turn_start_id,
                        "source_turn_end_id": data.source_turn_end_id,
                    },
                )
                row = connection.execute(
                    "SELECT * FROM context_summary WHERE id = ?", (summary_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def list_context_summaries(
        self,
        user_id: str,
        *,
        session_id: str | None = None,
        summary_scope: str | None = None,
        status: str | None = "active",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM context_summary WHERE user_id = ?"
        params: list[Any] = [user_id]
        if session_id is not None:
            query += " AND session_id = ?"
            params.append(session_id)
        if summary_scope:
            query += " AND summary_scope = ?"
            params.append(summary_scope)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def write_memory(self, data: MemoryCreate) -> dict[str, Any]:
        now = sqlite_timestamp()
        memory_id = self._new_id(data.memory_id)
        try:
            with self.database.transaction() as connection:
                row = self._insert_memory_in_connection(
                    connection,
                    memory_id=memory_id,
                    user_id=data.user_id,
                    memory_type=data.memory_type,
                    title=data.title,
                    content_text=data.content_text,
                    related_entity_type=data.related_entity_type,
                    related_entity_id=data.related_entity_id,
                    related_entity_name=data.related_entity_name,
                    importance_score=data.importance_score,
                    freshness_score=data.freshness_score,
                    expires_at=data.expires_at,
                    metadata=data.metadata,
                    now=now,
                )
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def _insert_memory_in_connection(
        self,
        connection: sqlite3.Connection,
        *,
        memory_id: str,
        user_id: str,
        memory_type: str,
        title: str,
        content_text: str,
        related_entity_type: str | None,
        related_entity_id: str | None,
        related_entity_name: str | None,
        importance_score: float,
        freshness_score: float,
        expires_at: str | None,
        metadata: dict[str, Any],
        now: str,
    ) -> sqlite3.Row:
        connection.execute(
            """
            INSERT INTO agent_memory_item(
                id, user_id, memory_type, title, content_text,
                related_entity_type, related_entity_id, related_entity_name,
                importance_score, freshness_score, expires_at, status,
                created_at, updated_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
            """,
            (
                memory_id,
                user_id,
                memory_type,
                title,
                content_text,
                related_entity_type,
                related_entity_id,
                related_entity_name,
                importance_score,
                freshness_score,
                expires_at,
                now,
                now,
                dumps(metadata),
            ),
        )
        self._write_local_event(
            connection,
            user_id=user_id,
            session_id=metadata.get("session_id"),
            event_type="memory_created",
            aggregate_type="memory",
            aggregate_id=memory_id,
            payload={
                "memory_type": memory_type,
                "title": title,
                "related_entity_name": related_entity_name,
            },
        )
        return connection.execute(
            "SELECT * FROM agent_memory_item WHERE id = ?", (memory_id,)
        ).fetchone()

    def get_memory(self, memory_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM agent_memory_item WHERE id = ?", (memory_id,)
            ).fetchone()
        return decode_mapping(self._require(row, "agent_memory_item")) or {}

    def update_memory(self, memory_id: str, data: MemoryUpdate) -> dict[str, Any]:
        fields: list[str] = []
        values: list[Any] = []
        for field, value in (
            ("status", data.status),
            ("content_text", data.content_text),
            ("importance_score", data.importance_score),
            ("freshness_score", data.freshness_score),
            ("expires_at", data.expires_at),
        ):
            if value is not None:
                fields.append(f"{field} = ?")
                values.append(value)
        if data.metadata is not None:
            fields.append("metadata_json = ?")
            values.append(dumps(data.metadata))
        if not fields:
            return self.get_memory(memory_id)
        fields.append("updated_at = ?")
        values.append(sqlite_timestamp())
        values.append(memory_id)
        with self.database.transaction() as connection:
            cursor = connection.execute(
                f"UPDATE agent_memory_item SET {', '.join(fields)} WHERE id = ?",
                values,
            )
            if cursor.rowcount == 0:
                raise NotFoundError("agent_memory_item not found")
            row = connection.execute(
                "SELECT * FROM agent_memory_item WHERE id = ?", (memory_id,)
            ).fetchone()
        return decode_mapping(row) or {}

    def list_memories(
        self,
        user_id: str,
        *,
        memory_type: str | None = None,
        status: str | None = "active",
        include_expired: bool = False,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        now = sqlite_timestamp()
        with self.database.transaction() as connection:
            connection.execute(
                """
                UPDATE agent_memory_item
                SET status = 'expired', updated_at = ?
                WHERE user_id = ? AND status = 'active'
                  AND expires_at IS NOT NULL AND expires_at <= ?
                """,
                (now, user_id, now),
            )
            query = "SELECT * FROM agent_memory_item WHERE user_id = ?"
            params: list[Any] = [user_id]
            if memory_type:
                query += " AND memory_type = ?"
                params.append(memory_type)
            if status:
                query += " AND status = ?"
                params.append(status)
            if not include_expired:
                query += " AND (expires_at IS NULL OR expires_at > ?)"
                params.append(now)
            query += " ORDER BY importance_score DESC, freshness_score DESC, updated_at DESC LIMIT ?"
            params.append(limit)
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def upsert_active_context(self, data: ActiveContextUpsert) -> dict[str, Any]:
        now = sqlite_timestamp()
        local_id = self._new_id(data.ref_id_local)
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO active_context_ref(
                        id, user_id, session_id, ref_type, ref_id, ref_name,
                        status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, session_id, ref_type, ref_id)
                    DO UPDATE SET ref_name = excluded.ref_name,
                                  status = excluded.status,
                                  updated_at = excluded.updated_at
                    """,
                    (
                        local_id,
                        data.user_id,
                        data.session_id,
                        data.ref_type,
                        data.ref_id,
                        data.ref_name,
                        data.status,
                        now,
                        now,
                    ),
                )
                row = connection.execute(
                    """
                    SELECT * FROM active_context_ref
                    WHERE user_id = ?
                      AND ((session_id = ?) OR (session_id IS NULL AND ? IS NULL))
                      AND ref_type = ? AND ref_id = ?
                    """,
                    (
                        data.user_id,
                        data.session_id,
                        data.session_id,
                        data.ref_type,
                        data.ref_id,
                    ),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def update_active_context_status(
        self, context_id: str, data: ActiveContextStatusUpdate
    ) -> dict[str, Any]:
        with self.database.transaction() as connection:
            cursor = connection.execute(
                "UPDATE active_context_ref SET status = ?, updated_at = ? WHERE id = ?",
                (data.status, sqlite_timestamp(), context_id),
            )
            if cursor.rowcount == 0:
                raise NotFoundError("active_context_ref not found")
            row = connection.execute(
                "SELECT * FROM active_context_ref WHERE id = ?", (context_id,)
            ).fetchone()
        return decode_mapping(row) or {}

    def list_active_context(
        self,
        user_id: str,
        *,
        session_id: str | None = None,
        status: str | None = "active",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM active_context_ref WHERE user_id = ?"
        params: list[Any] = [user_id]
        if session_id is not None:
            query += " AND session_id = ?"
            params.append(session_id)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def _write_evidence_summary_and_memory(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        session_id: str | None,
        result: str,
        source_type: str,
        source_id: str,
        tags: list[Mapping[str, Any]],
        error_text: str | None,
        now: str,
    ) -> None:
        if not session_id:
            return
        tags = [dict(tag) for tag in tags]
        names = [str(tag.get("tag_name")) for tag in tags if tag.get("tag_name")]
        primary = names[0] if names else "当前学习目标"
        if result == "fail":
            summary_text = f"本轮{source_type}在“{primary}”上失败，需继续复习。"
        elif result == "partial":
            summary_text = f"本轮{source_type}对“{primary}”部分掌握，仍需巩固。"
        elif result == "success":
            summary_text = f"本轮{source_type}在“{primary}”上成功，证据已写入状态。"
        else:
            summary_text = f"本轮{source_type}被跳过，没有改变正式掌握状态。"
        existing = connection.execute(
            """
            SELECT * FROM context_summary
            WHERE user_id = ? AND session_id = ?
              AND summary_scope = 'session' AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, session_id),
        ).fetchone()
        previous = existing["summary_text"] if existing else ""
        combined = (previous + " " + summary_text).strip()
        if len(combined) > 1800:
            combined = combined[-1800:]
        if existing:
            connection.execute(
                """
                UPDATE context_summary
                SET summary_text = ?, structured_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    combined,
                    dumps(
                        {
                            "last_evidence": {
                                "source_type": source_type,
                                "source_id": source_id,
                                "result": result,
                                "tags": names,
                                "error": error_text,
                            }
                        }
                    ),
                    now,
                    existing["id"],
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO context_summary(
                    id, user_id, session_id, summary_scope, summary_text,
                    structured_json, confidence, status, created_at, updated_at
                ) VALUES (?, ?, ?, 'session', ?, ?, 1.0, 'active', ?, ?)
                """,
                (
                    str(uuid4()),
                    user_id,
                    session_id,
                    combined,
                    dumps(
                        {
                            "last_evidence": {
                                "source_type": source_type,
                                "source_id": source_id,
                                "result": result,
                                "tags": names,
                                "error": error_text,
                            }
                        }
                    ),
                    now,
                    now,
                ),
            )
        if result in {"fail", "partial"}:
            memory_type = "warning" if result == "fail" else "open_loop"
            title = f"{primary}需要继续巩固"
            content = error_text or summary_text
            # Avoid unbounded duplicate memories for the same source.
            duplicate = connection.execute(
                """
                SELECT id FROM agent_memory_item
                WHERE user_id = ? AND status = 'active'
                  AND json_extract(metadata_json, '$.source_type') = ?
                  AND json_extract(metadata_json, '$.source_id') = ?
                LIMIT 1
                """,
                (user_id, source_type, source_id),
            ).fetchone()
            if duplicate is None:
                self._insert_memory_in_connection(
                    connection,
                    memory_id=str(uuid4()),
                    user_id=user_id,
                    memory_type=memory_type,
                    title=title,
                    content_text=content,
                    related_entity_type=(tags[0].get("tag_type") if tags else None),
                    related_entity_id=(tags[0].get("tag_id") if tags else None),
                    related_entity_name=primary,
                    importance_score=0.85 if result == "fail" else 0.70,
                    freshness_score=1.0,
                    expires_at=None,
                    metadata={
                        "session_id": session_id,
                        "source_type": source_type,
                        "source_id": source_id,
                        "evidence_based": True,
                    },
                    now=now,
                )

    def context_compression_status(
        self, user_id: str, session_id: str
    ) -> dict[str, Any]:
        with self.database.read() as connection:
            session = self._require(
                connection.execute(
                    "SELECT * FROM learning_session WHERE id = ? AND user_id = ?",
                    (session_id, user_id),
                ).fetchone(),
                "session",
            )
            stats = connection.execute(
                """
                SELECT COUNT(*) AS turn_count,
                       COALESCE(SUM(token_estimate), 0) AS token_total
                FROM conversation_turn WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()
            config = ConfigService.effective_bundle_from_connection(
                connection, user_id=user_id, session_id=session_id
            )
            latest_summary = connection.execute(
                """
                SELECT * FROM context_summary
                WHERE user_id = ? AND session_id = ? AND summary_scope = 'session'
                  AND status = 'active' ORDER BY updated_at DESC LIMIT 1
                """,
                (user_id, session_id),
            ).fetchone()
            completed_fact = connection.execute(
                """
                SELECT MAX(ts) AS latest FROM (
                    SELECT MAX(state_applied_at) AS ts FROM question_attempt WHERE session_id = ?
                    UNION ALL
                    SELECT MAX(state_applied_at) AS ts FROM review_event WHERE session_id = ?
                )
                """,
                (session_id, session_id),
            ).fetchone()
        max_turns = int(config.get("max_context_turns", 6))
        token_threshold = int(config.get("context_compress_threshold_tokens", 3000))
        reasons: list[str] = []
        if int(stats["turn_count"]) >= max_turns:
            reasons.append("turn_count_threshold")
        if int(stats["token_total"]) >= token_threshold:
            reasons.append("token_threshold")
        latest_fact = completed_fact["latest"] if completed_fact else None
        latest_summary_time = latest_summary["updated_at"] if latest_summary else None
        if latest_fact and (not latest_summary_time or latest_fact > latest_summary_time):
            reasons.append("completed_attempt_or_review")
        if session["status"] in {"completed", "interrupted", "failed"}:
            reasons.append("session_closed")
        return {
            "user_id": user_id,
            "session_id": session_id,
            "should_compress": bool(reasons),
            "reasons": reasons,
            "turn_count": int(stats["turn_count"]),
            "token_total": int(stats["token_total"]),
            "thresholds": {
                "max_context_turns": max_turns,
                "context_compress_threshold_tokens": token_threshold,
            },
            "latest_summary": decode_mapping(latest_summary),
            "note": "The SQLite service detects triggers and stores summaries; the Context Compressor Agent creates the semantic summary.",
        }

    # ------------------------------------------------------------------
    # Pending state deltas: evidence gate for Agent suggestions
    # ------------------------------------------------------------------
    def create_pending_delta(self, data: PendingDeltaCreate) -> dict[str, Any]:
        delta_id = self._new_id(data.delta_id)
        now = sqlite_timestamp()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO pending_state_delta(
                        id, user_id, session_id, workflow_run_id, attempt_id,
                        review_event_id, delta_type, proposed_by, delta_json,
                        validation_status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
                    """,
                    (
                        delta_id,
                        data.user_id,
                        data.session_id,
                        data.workflow_run_id,
                        data.attempt_id,
                        data.review_event_id,
                        data.delta_type,
                        data.proposed_by,
                        dumps(data.delta),
                        now,
                    ),
                )
                self._write_local_event(
                    connection,
                    user_id=data.user_id,
                    session_id=data.session_id,
                    event_type="state_delta_created",
                    aggregate_type="state_delta",
                    aggregate_id=delta_id,
                    payload={
                        "delta_type": data.delta_type,
                        "proposed_by": data.proposed_by,
                        "attempt_id": data.attempt_id,
                        "review_event_id": data.review_event_id,
                        "workflow_run_id": data.workflow_run_id,
                    },
                )
                row = connection.execute(
                    "SELECT * FROM pending_state_delta WHERE id = ?", (delta_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            self._handle_integrity(exc)
        return decode_mapping(row) or {}

    def get_pending_delta(self, delta_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            row = connection.execute(
                "SELECT * FROM pending_state_delta WHERE id = ?", (delta_id,)
            ).fetchone()
        return decode_mapping(self._require(row, "pending_state_delta")) or {}

    def validate_and_apply_delta(self, delta_id: str) -> dict[str, Any]:
        with self.database.transaction() as connection:
            delta = self._require(
                connection.execute(
                    "SELECT * FROM pending_state_delta WHERE id = ?", (delta_id,)
                ).fetchone(),
                "pending_state_delta",
            )
            if delta["validation_status"] == "applied":
                return decode_mapping(delta) or {}
            if delta["validation_status"] == "rejected":
                return decode_mapping(delta) or {}
            payload = loads(delta["delta_json"], {})
            if not isinstance(payload, dict):
                return self._reject_delta(connection, delta_id, "delta_json must be an object")
            workflow_reason = self._validate_delta_workflow(connection, delta)
            if workflow_reason:
                return self._reject_delta(connection, delta_id, workflow_reason)
            config = self._rule_config(
                connection, delta["user_id"], delta["session_id"]
            )

            if delta["delta_type"] == "mastery_update":
                allowed = {
                    "action",
                    "attempt_id",
                    "review_event_id",
                    "requested_entity_type",
                    "requested_entity_id",
                    "requested_entity_name",
                    "entity_type",
                    "entity_id",
                    "entity_name",
                    "mastery_change",
                    "confidence_change",
                    "evidence",
                }
                extra = set(payload) - allowed
                if extra:
                    return self._reject_delta(
                        connection,
                        delta_id,
                        f"mastery_update contains unsupported fields: {sorted(extra)}",
                    )
                for field, limit in (
                    ("mastery_change", config.max_mastery_change_per_event),
                    ("confidence_change", config.max_confidence_change_per_event),
                ):
                    if field in payload:
                        try:
                            requested = float(payload[field])
                        except (TypeError, ValueError):
                            return self._reject_delta(
                                connection, delta_id, f"{field} must be numeric"
                            )
                        if abs(requested) > limit:
                            return self._reject_delta(
                                connection,
                                delta_id,
                                f"{field} exceeds configured legal range ±{limit}",
                            )
                if delta["attempt_id"]:
                    attempt = self._require(
                        connection.execute(
                            "SELECT * FROM question_attempt WHERE id = ?",
                            (delta["attempt_id"],),
                        ).fetchone(),
                        "attempt",
                    )
                    tags = connection.execute(
                        "SELECT * FROM question_attempt_tag WHERE attempt_id = ?",
                        (delta["attempt_id"],),
                    ).fetchall()
                    try:
                        self._validate_attempt_evidence(attempt, tags)
                        self._validate_requested_entity(payload, tags)
                    except DomainValidationError as exc:
                        return self._reject_delta(connection, delta_id, str(exc))
                    self._approve_delta(
                        connection,
                        delta_id,
                        "approved: checked attempt, references, fields and ranges verified",
                    )
                    if attempt["state_applied_at"]:
                        return self._mark_delta_applied(
                            connection,
                            delta_id,
                            "attempt state was already applied idempotently",
                        )
                    return self._apply_attempt_in_connection(
                        connection, attempt=attempt, tags=tags, delta_id=delta_id
                    )
                if delta["review_event_id"]:
                    review = self._require(
                        connection.execute(
                            "SELECT * FROM review_event WHERE id = ?",
                            (delta["review_event_id"],),
                        ).fetchone(),
                        "review_event",
                    )
                    if review["result"] not in {"success", "fail", "partial", "skipped"}:
                        return self._reject_delta(
                            connection, delta_id, "review_event has no valid result"
                        )
                    self._approve_delta(
                        connection,
                        delta_id,
                        "approved: review fact, references, fields and ranges verified",
                    )
                    if review["state_applied_at"]:
                        return self._mark_delta_applied(
                            connection,
                            delta_id,
                            "review state was already applied idempotently",
                        )
                    return self._apply_review_in_connection(
                        connection, review_event=review, delta_id=delta_id
                    )
                return self._reject_delta(
                    connection,
                    delta_id,
                    "No verifiable fact path: mastery_update requires attempt_id or review_event_id fact evidence",
                )

            if delta["delta_type"] == "memory_update":
                allowed = {
                    "memory_type",
                    "title",
                    "content_text",
                    "related_entity_type",
                    "related_entity_id",
                    "related_entity_name",
                    "importance_score",
                    "freshness_score",
                    "expires_at",
                    "metadata",
                }
                extra = set(payload) - allowed
                required = {"memory_type", "title", "content_text"}
                if extra or not required.issubset(payload):
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "memory_update requires memory_type/title/content_text and only documented fields",
                    )
                if payload["memory_type"] not in {
                    "short_term",
                    "working",
                    "learning_preference",
                    "open_loop",
                    "warning",
                    "strategy",
                }:
                    return self._reject_delta(connection, delta_id, "unsupported memory_type")
                try:
                    importance = float(payload.get("importance_score", 0.5))
                    freshness = float(payload.get("freshness_score", 1.0))
                except (TypeError, ValueError):
                    return self._reject_delta(
                        connection, delta_id, "memory scores must be numeric"
                    )
                if not (0.0 <= importance <= 1.0 and 0.0 <= freshness <= 1.0):
                    return self._reject_delta(
                        connection, delta_id, "memory scores must be within 0..1"
                    )
                now = sqlite_timestamp()
                memory_id = str(uuid4())
                row = self._insert_memory_in_connection(
                    connection,
                    memory_id=memory_id,
                    user_id=delta["user_id"],
                    memory_type=payload["memory_type"],
                    title=str(payload["title"]),
                    content_text=str(payload["content_text"]),
                    related_entity_type=payload.get("related_entity_type"),
                    related_entity_id=payload.get("related_entity_id"),
                    related_entity_name=payload.get("related_entity_name"),
                    importance_score=importance,
                    freshness_score=freshness,
                    expires_at=payload.get("expires_at"),
                    metadata={
                        **(payload.get("metadata") or {}),
                        "session_id": delta["session_id"],
                        "pending_state_delta_id": delta_id,
                        "soft_state": True,
                    },
                    now=now,
                )
                applied = self._mark_delta_applied(
                    connection,
                    delta_id,
                    "soft memory update applied; no formal mastery was changed",
                )
                applied["memory"] = decode_mapping(row)
                return applied

            if delta["delta_type"] == "error_pattern_update":
                allowed = {
                    "error_type",
                    "error_pattern_name",
                    "related_entity_type",
                    "related_entity_name",
                    "result",
                    "evidence",
                }
                extra = set(payload) - allowed
                if extra:
                    return self._reject_delta(
                        connection,
                        delta_id,
                        f"error_pattern_update contains unsupported fields: {sorted(extra)}",
                    )
                fact_result, fact = self._delta_fact_result(connection, delta)
                if fact_result is None or fact is None:
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "error_pattern_update requires attempt_id or review_event_id with a graded result",
                    )
                if payload.get("result") and payload["result"] != fact_result:
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "proposed result conflicts with recorded fact",
                    )
                self._approve_delta(
                    connection,
                    delta_id,
                    "approved: error change is tied to a recorded graded fact",
                )
                result = self._apply_explicit_error_delta(
                    connection, delta=delta, payload=payload, result=fact_result, fact=fact
                )
                applied = self._mark_delta_applied(
                    connection, delta_id, "deterministic error-pattern rule applied"
                )
                applied["error_pattern"] = result
                return applied

            if delta["delta_type"] == "review_schedule_update":
                allowed = {
                    "target_type",
                    "target_id",
                    "target_name",
                    "importance_score",
                    "result",
                    "evidence",
                }
                extra = set(payload) - allowed
                required = {"target_type", "target_name"}
                if extra or not required.issubset(payload):
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "review_schedule_update requires target_type/target_name and only documented fields",
                    )
                if payload["target_type"] not in REVIEW_TARGET_TYPES:
                    return self._reject_delta(connection, delta_id, "unsupported review target_type")
                fact_result, fact = self._delta_fact_result(connection, delta)
                if fact_result is None or fact is None:
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "review_schedule_update requires attempt_id or review_event_id fact evidence",
                    )
                if payload.get("result") and payload["result"] != fact_result:
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "proposed result conflicts with recorded fact",
                    )
                try:
                    importance = float(payload.get("importance_score", 1.0))
                except (TypeError, ValueError):
                    return self._reject_delta(
                        connection, delta_id, "importance_score must be numeric"
                    )
                if not 0.0 <= importance <= 1.0:
                    return self._reject_delta(
                        connection, delta_id, "importance_score must be within 0..1"
                    )
                if not self._review_target_supported_by_fact(
                    connection, delta, payload, fact
                ):
                    return self._reject_delta(
                        connection,
                        delta_id,
                        "review target is not supported by the attached attempt/review evidence",
                    )
                self._approve_delta(
                    connection,
                    delta_id,
                    "approved: review target and graded evidence verified",
                )
                schedule = self._apply_explicit_schedule_delta(
                    connection,
                    delta=delta,
                    payload=payload,
                    result=fact_result,
                    importance=importance,
                )
                applied = self._mark_delta_applied(
                    connection, delta_id, "deterministic review schedule rule applied"
                )
                applied["review_schedule"] = schedule
                return applied

            return self._reject_delta(connection, delta_id, "unsupported delta_type")

    def _validate_delta_workflow(
        self, connection: sqlite3.Connection, delta: Mapping[str, Any]
    ) -> str | None:
        if not delta["workflow_run_id"]:
            return None
        workflow = connection.execute(
            "SELECT * FROM workflow_run WHERE id = ?", (delta["workflow_run_id"],)
        ).fetchone()
        if workflow is None:
            return "workflow_run does not exist"
        config = self._rule_config(
            connection, delta["user_id"], delta["session_id"]
        )
        if workflow["status"] not in config.state_write_allowed_workflow_statuses:
            return f"workflow status {workflow['status']} is not allowed to write state"
        if workflow["current_step"] and workflow["current_step"] not in config.state_write_allowed_steps:
            return f"workflow step {workflow['current_step']} is not allowed to write state"
        return None

    @staticmethod
    def _validate_requested_entity(
        payload: Mapping[str, Any], tags: Iterable[Mapping[str, Any]]
    ) -> None:
        requested_type = payload.get("requested_entity_type") or payload.get("entity_type")
        requested_name = payload.get("requested_entity_name") or payload.get("entity_name")
        requested_id = payload.get("requested_entity_id") or payload.get("entity_id")
        if not any((requested_type, requested_name, requested_id)):
            return
        for tag in tags:
            if requested_type and tag["tag_type"] != requested_type:
                continue
            if requested_name and tag["tag_name"] != requested_name:
                continue
            if requested_id and tag["tag_id"] != requested_id:
                continue
            return
        raise DomainValidationError(
            "requested mastery entity is not present in the recorded tag snapshot"
        )

    @staticmethod
    def _approve_delta(
        connection: sqlite3.Connection, delta_id: str, reason: str
    ) -> None:
        connection.execute(
            """
            UPDATE pending_state_delta
            SET validation_status = 'approved', validation_reason = ?, validated_at = ?
            WHERE id = ?
            """,
            (reason, sqlite_timestamp(), delta_id),
        )

    def _mark_delta_applied(
        self, connection: sqlite3.Connection, delta_id: str, reason: str
    ) -> dict[str, Any]:
        now = sqlite_timestamp()
        connection.execute(
            """
            UPDATE pending_state_delta
            SET validation_status = 'applied', validation_reason = ?,
                validated_at = COALESCE(validated_at, ?), applied_at = ?
            WHERE id = ?
            """,
            (reason, now, now, delta_id),
        )
        row = connection.execute(
            "SELECT * FROM pending_state_delta WHERE id = ?", (delta_id,)
        ).fetchone()
        result = decode_mapping(row) or {}
        self._write_local_event(
            connection,
            user_id=row["user_id"],
            session_id=row["session_id"],
            event_type="state_delta_applied",
            aggregate_type="state_delta",
            aggregate_id=delta_id,
            payload={"delta_type": row["delta_type"], "reason": reason},
        )
        return result

    def _reject_delta(
        self, connection: sqlite3.Connection, delta_id: str, reason: str
    ) -> dict[str, Any]:
        now = sqlite_timestamp()
        connection.execute(
            """
            UPDATE pending_state_delta
            SET validation_status = 'rejected', validation_reason = ?,
                validated_at = ? WHERE id = ?
            """,
            (reason, now, delta_id),
        )
        row = connection.execute(
            "SELECT * FROM pending_state_delta WHERE id = ?", (delta_id,)
        ).fetchone()
        self._write_local_event(
            connection,
            user_id=row["user_id"],
            session_id=row["session_id"],
            event_type="state_delta_rejected",
            aggregate_type="state_delta",
            aggregate_id=delta_id,
            payload={"delta_type": row["delta_type"], "reason": reason},
        )
        return decode_mapping(row) or {}

    def _delta_fact_result(
        self, connection: sqlite3.Connection, delta: Mapping[str, Any]
    ) -> tuple[str | None, Mapping[str, Any] | None]:
        if delta["attempt_id"]:
            attempt = connection.execute(
                "SELECT * FROM question_attempt WHERE id = ?", (delta["attempt_id"],)
            ).fetchone()
            if attempt is None:
                return None, None
            try:
                return self._attempt_result(attempt), attempt
            except DomainValidationError:
                return None, attempt
        if delta["review_event_id"]:
            review = connection.execute(
                "SELECT * FROM review_event WHERE id = ?", (delta["review_event_id"],)
            ).fetchone()
            if review is None or review["result"] not in {"success", "fail", "partial", "skipped"}:
                return None, review
            return review["result"], review
        return None, None

    def _apply_explicit_error_delta(
        self,
        connection: sqlite3.Connection,
        *,
        delta: Mapping[str, Any],
        payload: Mapping[str, Any],
        result: str,
        fact: Mapping[str, Any],
    ) -> dict[str, Any]:
        now = sqlite_timestamp()
        if delta["attempt_id"]:
            tags = connection.execute(
                "SELECT * FROM question_attempt_tag WHERE attempt_id = ? ORDER BY role",
                (delta["attempt_id"],),
            ).fetchall()
            if not tags:
                raise DomainValidationError("attempt has no tag evidence")
            attempt = dict(fact)
            if payload.get("error_type"):
                attempt["main_error_type"] = payload["error_type"]
            if payload.get("error_pattern_name"):
                attempt["error_detail_text"] = payload["error_pattern_name"]
            if result == "fail":
                return self._upsert_error_pattern_from_attempt(
                    connection, attempt=attempt, tags=list(tags), now=now
                )
            updates = self._improve_related_errors(
                connection,
                user_id=delta["user_id"],
                tags=list(tags),
                result=result,
                now=now,
            )
            return updates[0] if updates else {"status": "no_matching_error_pattern"}
        review = fact
        target_name = payload.get("error_pattern_name") or review["target_name"]
        synthetic = dict(review)
        synthetic["target_type"] = "error_pattern"
        synthetic["target_name"] = target_name
        synthetic["target_id"] = payload.get("target_id") or review["target_id"]
        return self._apply_error_review(
            connection, review_event=synthetic, result=result, now=now
        )

    def _review_target_supported_by_fact(
        self,
        connection: sqlite3.Connection,
        delta: Mapping[str, Any],
        payload: Mapping[str, Any],
        fact: Mapping[str, Any],
    ) -> bool:
        target_type = payload["target_type"]
        target_name = payload["target_name"]
        target_id = payload.get("target_id")
        if delta["attempt_id"]:
            if target_type == "question":
                # target_id is the authoritative cross-database reference;
                # target_name may be a human-readable label.
                return target_id in {None, fact["question_id"]}
            rows = connection.execute(
                "SELECT * FROM question_attempt_tag WHERE attempt_id = ?",
                (delta["attempt_id"],),
            ).fetchall()
            return any(
                row["tag_type"] == target_type
                and row["tag_name"] == target_name
                and (target_id is None or row["tag_id"] == target_id)
                for row in rows
            )
        return (
            fact["target_type"] == target_type
            and fact["target_name"] == target_name
            and (target_id is None or fact["target_id"] in {None, target_id})
        )

    def _apply_explicit_schedule_delta(
        self,
        connection: sqlite3.Connection,
        *,
        delta: Mapping[str, Any],
        payload: Mapping[str, Any],
        result: str,
        importance: float,
    ) -> dict[str, Any]:
        now = sqlite_timestamp()
        target_type = payload["target_type"]
        target_name = payload["target_name"]
        target_id = payload.get("target_id")
        schedule = connection.execute(
            """
            SELECT * FROM review_schedule
            WHERE user_id = ? AND target_type = ? AND target_name = ?
            """,
            (delta["user_id"], target_type, target_name),
        ).fetchone()
        mastery_score = 0.5
        if target_type in MASTERY_ENTITY_TYPES:
            mastery = connection.execute(
                """
                SELECT mastery_score FROM mastery_state
                WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                """,
                (delta["user_id"], target_type, target_name),
            ).fetchone()
            if mastery:
                mastery_score = float(mastery["mastery_score"])
        config = self._rule_config(
            connection, delta["user_id"], delta["session_id"]
        )
        transition = update_review_schedule(
            old_interval_days=float(schedule["interval_days"]) if schedule else None,
            old_ease_factor=float(schedule["ease_factor"]) if schedule else None,
            result=result,
            mastery_score=mastery_score,
            severity_score=1.0 if result == "fail" else (0.5 if result == "partial" else 0.0),
            importance_score=importance,
            config=config,
        )
        return self._upsert_review_schedule(
            connection,
            user_id=delta["user_id"],
            session_id=delta["session_id"],
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            result=result,
            transition=transition,
            priority_score=transition.priority_score,
            is_review=bool(delta["review_event_id"]),
            evidence={
                "pending_state_delta_id": delta["id"],
                "attempt_id": delta["attempt_id"],
                "review_event_id": delta["review_event_id"],
                "priority_components": transition.priority_components,
            },
            now=now,
        )

    def list_pending_deltas(
        self, user_id: str, status: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM pending_state_delta WHERE user_id = ?"
        params: list[Any] = [user_id]
        if status:
            query += " AND validation_status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    # ------------------------------------------------------------------
    # State queries, explanations, bootstrap context, and decay
    # ------------------------------------------------------------------
    def query_recent_learning(
        self, user_id: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        with self.database.read() as connection:
            rows = connection.execute(
                """
                SELECT * FROM v_recent_learning
                WHERE user_id = ? ORDER BY started_at DESC LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return decode_rows(rows)

    def query_wrong_questions(
        self,
        user_id: str,
        tag_type: str | None = None,
        tag_name: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        return self.list_attempts(
            user_id,
            is_correct=False,
            tag_type=tag_type,
            tag_name=tag_name,
            limit=limit,
        )

    def query_mastery(
        self,
        user_id: str,
        *,
        entity_type: str | None = None,
        state_label: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM mastery_state WHERE user_id = ?"
        params: list[Any] = [user_id]
        if entity_type:
            query += " AND entity_type = ?"
            params.append(entity_type)
        if state_label:
            query += " AND state_label = ?"
            params.append(state_label)
        query += " ORDER BY mastery_score ASC, confidence_score ASC, updated_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
            result: list[dict[str, Any]] = []
            for row in rows:
                item = decode_mapping(row) or {}
                item["diversity"] = self._diversity_evidence(
                    connection,
                    user_id,
                    row["entity_type"],
                    row["entity_name"],
                ).as_dict()
                result.append(item)
        return result

    def query_weak_items(
        self, user_id: str, entity_type: str | None = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        all_items = self.query_mastery(
            user_id, entity_type=entity_type, state_label=None, limit=500
        )
        weak = [
            item
            for item in all_items
            if item["state_label"] in {"exposed", "weak", "learning", "reviewing"}
        ]
        return weak[:limit]

    def get_mastery_detail(
        self,
        user_id: str,
        entity_type: str,
        entity_name: str,
        history_limit: int = 50,
    ) -> dict[str, Any]:
        with self.database.read() as connection:
            state = connection.execute(
                """
                SELECT * FROM mastery_state
                WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                """,
                (user_id, entity_type, entity_name),
            ).fetchone()
            self._require(state, "mastery_state")
            history = connection.execute(
                """
                SELECT * FROM mastery_event
                WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                ORDER BY created_at DESC LIMIT ?
                """,
                (user_id, entity_type, entity_name, history_limit),
            ).fetchall()
            schedule = connection.execute(
                """
                SELECT * FROM review_schedule
                WHERE user_id = ? AND target_type = ? AND target_name = ?
                """,
                (user_id, entity_type, entity_name),
            ).fetchone()
            errors = connection.execute(
                """
                SELECT * FROM error_pattern_state
                WHERE user_id = ? AND related_entity_type = ?
                  AND related_entity_name = ?
                ORDER BY severity_score DESC
                """,
                (user_id, entity_type, entity_name),
            ).fetchall()
            diversity = self._diversity_evidence(
                connection, user_id, entity_type, entity_name
            )
        return {
            "state": decode_mapping(state),
            "diversity": diversity.as_dict(),
            "history": decode_rows(history),
            "review_schedule": decode_mapping(schedule),
            "related_error_patterns": decode_rows(errors),
        }

    def query_mastery_history(
        self,
        user_id: str,
        *,
        entity_type: str | None = None,
        entity_name: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM mastery_event WHERE user_id = ?"
        params: list[Any] = [user_id]
        if entity_type:
            query += " AND entity_type = ?"
            params.append(entity_type)
        if entity_name:
            query += " AND entity_name = ?"
            params.append(entity_name)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def replay_mastery(
        self, user_id: str, entity_type: str, entity_name: str
    ) -> dict[str, Any]:
        """Replay the auditable mastery history and compare it with the snapshot."""
        with self.database.read() as connection:
            snapshot = connection.execute(
                """
                SELECT * FROM mastery_state
                WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                """,
                (user_id, entity_type, entity_name),
            ).fetchone()
            snapshot = self._require(snapshot, "mastery_state")
            events = connection.execute(
                """
                SELECT * FROM mastery_event
                WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                ORDER BY created_at ASC, id ASC
                """,
                (user_id, entity_type, entity_name),
            ).fetchall()
        decoded_events = decode_rows(events)
        anomalies: list[dict[str, Any]] = []
        mastery: float | None = None
        confidence: float | None = None
        state_label: str | None = None
        for index, event in enumerate(decoded_events):
            if index == 0:
                mastery = event.get("old_mastery_score")
                confidence = event.get("old_confidence_score")
                state_label = event.get("old_state_label")
            else:
                old_mastery = event.get("old_mastery_score")
                old_confidence = event.get("old_confidence_score")
                old_label = event.get("old_state_label")
                if mastery is not None and old_mastery is not None and abs(float(old_mastery) - float(mastery)) > 1e-6:
                    anomalies.append(
                        {
                            "event_id": event["id"],
                            "field": "old_mastery_score",
                            "expected": mastery,
                            "actual": old_mastery,
                        }
                    )
                if confidence is not None and old_confidence is not None and abs(float(old_confidence) - float(confidence)) > 1e-6:
                    anomalies.append(
                        {
                            "event_id": event["id"],
                            "field": "old_confidence_score",
                            "expected": confidence,
                            "actual": old_confidence,
                        }
                    )
                if state_label is not None and old_label is not None and old_label != state_label:
                    anomalies.append(
                        {
                            "event_id": event["id"],
                            "field": "old_state_label",
                            "expected": state_label,
                            "actual": old_label,
                        }
                    )
            mastery = event.get("new_mastery_score")
            confidence = event.get("new_confidence_score")
            state_label = event.get("new_state_label")
        snapshot_dict = decode_mapping(snapshot) or {}
        reconstructed = {
            "mastery_score": mastery,
            "confidence_score": confidence,
            "state_label": state_label,
        }
        matches_snapshot = bool(decoded_events) and not anomalies
        if decoded_events:
            matches_snapshot = matches_snapshot and (
                mastery is not None
                and confidence is not None
                and abs(float(mastery) - float(snapshot_dict["mastery_score"])) <= 1e-6
                and abs(float(confidence) - float(snapshot_dict["confidence_score"])) <= 1e-6
                and state_label == snapshot_dict["state_label"]
            )
        return {
            "snapshot": snapshot_dict,
            "reconstructed": reconstructed,
            "matches_snapshot": matches_snapshot,
            "event_count": len(decoded_events),
            "anomalies": anomalies,
            "events": decoded_events,
        }

    def explain_mastery(
        self, user_id: str, entity_type: str, entity_name: str
    ) -> dict[str, Any]:
        detail = self.get_mastery_detail(user_id, entity_type, entity_name, 20)
        state = detail["state"]
        history = detail["history"]
        latest = history[0] if history else None
        return {
            "entity_type": entity_type,
            "entity_name": entity_name,
            "current_mastery_score": state["mastery_score"],
            "current_confidence_score": state["confidence_score"],
            "state_label": state["state_label"],
            "evidence_counts": {
                "exposure_count": state["exposure_count"],
                "correct_count": state["correct_count"],
                "wrong_count": state["wrong_count"],
            },
            "diversity": detail["diversity"],
            "latest_change": latest,
            "why": (
                "The current snapshot is the result of replayable mastery_event records. "
                "Mastery and confidence are separate, and mastered additionally requires "
                "distinct questions, structures, and difficulty levels."
            ),
            "history": history,
        }

    def query_error_patterns(
        self,
        user_id: str,
        *,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM error_pattern_state WHERE user_id = ?"
        params: list[Any] = [user_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY severity_score DESC, updated_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def query_review_schedules(
        self,
        user_id: str,
        *,
        status: str | None = None,
        target_type: str | None = None,
        due_only: bool = False,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        now = sqlite_timestamp()
        query = "SELECT * FROM review_schedule WHERE user_id = ?"
        params: list[Any] = [user_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        if target_type:
            query += " AND target_type = ?"
            params.append(target_type)
        if due_only:
            query += " AND status IN ('scheduled', 'due') AND due_at <= ?"
            params.append(now)
        query += " ORDER BY priority_score DESC, due_at ASC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def query_due_reviews(self, user_id: str, limit: int = 10) -> list[dict[str, Any]]:
        return self.query_review_schedules(user_id, due_only=True, limit=limit)

    def explain_review_schedule(self, schedule_id: str) -> dict[str, Any]:
        with self.database.read() as connection:
            schedule = connection.execute(
                "SELECT * FROM review_schedule WHERE id = ?", (schedule_id,)
            ).fetchone()
            self._require(schedule, "review_schedule")
            mastery = None
            if schedule["target_type"] in MASTERY_ENTITY_TYPES:
                mastery = connection.execute(
                    """
                    SELECT * FROM mastery_state
                    WHERE user_id = ? AND entity_type = ? AND entity_name = ?
                    """,
                    (
                        schedule["user_id"],
                        schedule["target_type"],
                        schedule["target_name"],
                    ),
                ).fetchone()
            errors = connection.execute(
                """
                SELECT * FROM error_pattern_state
                WHERE user_id = ? AND related_entity_name = ?
                ORDER BY severity_score DESC LIMIT 10
                """,
                (schedule["user_id"], schedule["target_name"]),
            ).fetchall()
            reviews = connection.execute(
                """
                SELECT * FROM review_event
                WHERE schedule_id = ? ORDER BY created_at DESC LIMIT 20
                """,
                (schedule_id,),
            ).fetchall()
        schedule_dict = decode_mapping(schedule) or {}
        metadata = schedule_dict.get("metadata_json", {})
        return {
            "schedule": schedule_dict,
            "why": metadata.get("reason")
            or "Priority combines weakness, error severity, due degree, and importance.",
            "priority_formula": "0.35*(1-mastery) + 0.25*severity + 0.25*due + 0.15*importance",
            "priority_components": metadata.get("priority_components", {}),
            "related_mastery": decode_mapping(mastery),
            "related_error_patterns": decode_rows(errors),
            "review_history": decode_rows(reviews),
        }

    def query_local_events(
        self,
        user_id: str,
        *,
        event_type: str | None = None,
        aggregate_type: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM local_event_log WHERE user_id = ?"
        params: list[Any] = [user_id]
        if event_type:
            query += " AND event_type = ?"
            params.append(event_type)
        if aggregate_type:
            query += " AND aggregate_type = ?"
            params.append(aggregate_type)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self.database.read() as connection:
            rows = connection.execute(query, params).fetchall()
        return decode_rows(rows)

    def apply_mastery_decay(
        self,
        user_id: str,
        *,
        min_inactive_days: int = 30,
        as_of: str | None = None,
    ) -> dict[str, Any]:
        """Apply an explicit, auditable time-decay rule.

        The PDF reserves ``decay_rate`` but does not prescribe a formula. This
        implementation uses bounded linear decay per 30 inactive days and records
        a ``mastery_event(delta_reason='decay')`` for every change.
        """
        as_of_dt = parse_sqlite_timestamp(as_of) if as_of else datetime.now(timezone.utc)
        if as_of_dt is None:
            raise DomainValidationError("as_of must be an ISO/SQLite timestamp")
        changed: list[dict[str, Any]] = []
        now = sqlite_timestamp(as_of_dt)
        with self.database.transaction() as connection:
            rows = connection.execute(
                """
                SELECT * FROM mastery_state
                WHERE user_id = ? AND exposure_count > 0 AND last_seen_at IS NOT NULL
                """,
                (user_id,),
            ).fetchall()
            config = self._rule_config(connection, user_id, None)
            for row in rows:
                last_seen = parse_sqlite_timestamp(row["last_seen_at"])
                if last_seen is None:
                    continue
                inactive_days = (as_of_dt - last_seen).total_seconds() / 86400.0
                if inactive_days < min_inactive_days:
                    continue
                periods = inactive_days / 30.0
                old_mastery = float(row["mastery_score"])
                old_confidence = float(row["confidence_score"])
                decay_fraction = min(0.50, float(row["decay_rate"]) * periods)
                new_mastery = max(0.0, old_mastery * (1.0 - decay_fraction))
                new_confidence = max(0.0, old_confidence * (1.0 - decay_fraction * 0.5))
                if abs(new_mastery - old_mastery) < 1e-9:
                    continue
                diversity = self._diversity_evidence(
                    connection, user_id, row["entity_type"], row["entity_name"]
                )
                new_label = classify_state(
                    new_mastery,
                    new_confidence,
                    int(row["exposure_count"]),
                    row["recent_score"],
                    diversity,
                    config,
                )
                connection.execute(
                    """
                    UPDATE mastery_state
                    SET mastery_score = ?, confidence_score = ?, state_label = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (new_mastery, new_confidence, new_label, now, row["id"]),
                )
                event_id = str(uuid4())
                connection.execute(
                    """
                    INSERT INTO mastery_event(
                        id, user_id, mastery_state_id, entity_type, entity_id,
                        entity_name, old_mastery_score, new_mastery_score,
                        old_confidence_score, new_confidence_score, old_state_label,
                        new_state_label, delta_reason, evidence_text, created_at,
                        metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'decay', ?, ?, ?)
                    """,
                    (
                        event_id,
                        user_id,
                        row["id"],
                        row["entity_type"],
                        row["entity_id"],
                        row["entity_name"],
                        old_mastery,
                        new_mastery,
                        old_confidence,
                        new_confidence,
                        row["state_label"],
                        new_label,
                        f"inactive_days={inactive_days:.2f}; decay_rate={row['decay_rate']}",
                        now,
                        dumps({"inactive_days": inactive_days, "decay_fraction": decay_fraction}),
                    ),
                )
                changed.append(
                    {
                        "mastery_state_id": row["id"],
                        "entity_type": row["entity_type"],
                        "entity_name": row["entity_name"],
                        "old_mastery_score": old_mastery,
                        "new_mastery_score": round(new_mastery, 6),
                        "old_state_label": row["state_label"],
                        "new_state_label": new_label,
                        "mastery_event_id": event_id,
                    }
                )
            if changed:
                self._write_local_event(
                    connection,
                    user_id=user_id,
                    session_id=None,
                    event_type="mastery_decay_applied",
                    aggregate_type="mastery",
                    aggregate_id=user_id,
                    payload={"changed_count": len(changed), "as_of": now},
                )
        return {"user_id": user_id, "as_of": now, "changed": changed}

    def get_agent_bootstrap_context(
        self, user_id: str, session_id: str | None = None, limit: int = 5
    ) -> dict[str, Any]:
        now = sqlite_timestamp()
        with self.database.transaction() as connection:
            user = self._require(
                connection.execute(
                    "SELECT * FROM user_profile WHERE user_id = ?", (user_id,)
                ).fetchone(),
                "user",
            )
            if session_id:
                session = self._require(
                    connection.execute(
                        "SELECT * FROM learning_session WHERE id = ? AND user_id = ?",
                        (session_id, user_id),
                    ).fetchone(),
                    "session",
                )
            else:
                session = connection.execute(
                    """
                    SELECT * FROM learning_session
                    WHERE user_id = ? ORDER BY started_at DESC LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()
                session_id = session["id"] if session else None

            connection.execute(
                """
                UPDATE agent_memory_item
                SET status = 'expired', updated_at = ?
                WHERE user_id = ? AND status = 'active'
                  AND expires_at IS NOT NULL AND expires_at <= ?
                """,
                (now, user_id, now),
            )

            def latest_summary(scope: str, scoped_session: str | None = None) -> sqlite3.Row | None:
                if scoped_session:
                    return connection.execute(
                        """
                        SELECT * FROM context_summary
                        WHERE user_id = ? AND session_id = ? AND summary_scope = ?
                          AND status = 'active' ORDER BY updated_at DESC LIMIT 1
                        """,
                        (user_id, scoped_session, scope),
                    ).fetchone()
                return connection.execute(
                    """
                    SELECT * FROM context_summary
                    WHERE user_id = ? AND summary_scope = ? AND status = 'active'
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (user_id, scope),
                ).fetchone()

            session_summary = latest_summary("session", session_id) if session_id else None
            topic_summary = latest_summary("topic")
            profile_summary = latest_summary("profile")
            workflow_summary = latest_summary("workflow", session_id) if session_id else None
            weak = connection.execute(
                """
                SELECT * FROM mastery_state
                WHERE user_id = ?
                  AND state_label IN ('exposed', 'weak', 'learning', 'reviewing')
                ORDER BY mastery_score ASC, confidence_score ASC, updated_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
            due = connection.execute(
                """
                SELECT * FROM review_schedule
                WHERE user_id = ? AND status IN ('scheduled', 'due') AND due_at <= ?
                ORDER BY priority_score DESC, due_at ASC LIMIT ?
                """,
                (user_id, now, limit),
            ).fetchall()
            errors = connection.execute(
                """
                SELECT * FROM error_pattern_state
                WHERE user_id = ? AND status IN ('active', 'improving')
                ORDER BY severity_score DESC, updated_at DESC LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
            memories = connection.execute(
                """
                SELECT * FROM agent_memory_item
                WHERE user_id = ? AND status = 'active'
                  AND (expires_at IS NULL OR expires_at > ?)
                ORDER BY importance_score DESC, freshness_score DESC, updated_at DESC
                LIMIT ?
                """,
                (user_id, now, max(limit, 10)),
            ).fetchall()
            if session_id:
                active_refs = connection.execute(
                    """
                    SELECT * FROM active_context_ref
                    WHERE user_id = ? AND session_id = ? AND status = 'active'
                    ORDER BY updated_at DESC
                    """,
                    (user_id, session_id),
                ).fetchall()
                runtime = connection.execute(
                    """
                    SELECT * FROM agent_runtime_state
                    WHERE user_id = ? AND session_id = ? AND status = 'active'
                    ORDER BY agent_name, state_key
                    """,
                    (user_id, session_id),
                ).fetchall()
                recent_turns = connection.execute(
                    """
                    SELECT * FROM conversation_turn
                    WHERE session_id = ? ORDER BY created_at DESC LIMIT 5
                    """,
                    (session_id,),
                ).fetchall()[::-1]
                workflow = connection.execute(
                    """
                    SELECT * FROM workflow_run
                    WHERE user_id = ? AND session_id = ?
                      AND status IN ('running', 'waiting_user')
                    ORDER BY started_at DESC LIMIT 1
                    """,
                    (user_id, session_id),
                ).fetchone()
            else:
                active_refs = []
                runtime = connection.execute(
                    """
                    SELECT * FROM agent_runtime_state
                    WHERE user_id = ? AND session_id IS NULL AND status = 'active'
                    ORDER BY agent_name, state_key
                    """,
                    (user_id,),
                ).fetchall()
                recent_turns = []
                workflow = connection.execute(
                    """
                    SELECT * FROM workflow_run
                    WHERE user_id = ? AND status IN ('running', 'waiting_user')
                    ORDER BY started_at DESC LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()
            config = ConfigService.effective_bundle_from_connection(
                connection, user_id=user_id, session_id=session_id
            )
            weak_items: list[dict[str, Any]] = []
            for row in weak:
                item = decode_mapping(row) or {}
                item["diversity"] = self._diversity_evidence(
                    connection,
                    user_id,
                    row["entity_type"],
                    row["entity_name"],
                ).as_dict()
                weak_items.append(item)

        user_dict = decode_mapping(user) or {}
        runtime_rows = decode_rows(runtime)
        runtime_map: dict[str, dict[str, Any]] = {}
        for item in runtime_rows:
            runtime_map.setdefault(item["agent_name"], {})[item["state_key"]] = item[
                "state_value_json"
            ]
        memory_rows = decode_rows(memories)
        return {
            "user_snapshot": {
                "user_id": user_dict["user_id"],
                "display_name": user_dict.get("display_name"),
                "current_subject": user_dict.get("current_subject"),
                "current_stage": user_dict.get("current_stage"),
                "preferences": user_dict.get("preference_json", {}),
                "current_session": decode_mapping(session),
            },
            "session_summary": decode_mapping(session_summary),
            "topic_summary": decode_mapping(topic_summary),
            "profile_summary": decode_mapping(profile_summary),
            "workflow_summary": decode_mapping(workflow_summary),
            "recent_active_memories": memory_rows,
            "open_loops": [item for item in memory_rows if item["memory_type"] == "open_loop"],
            "active_context": decode_rows(active_refs),
            "agent_runtime_state": runtime_map,
            "weak_mastery_items": weak_items,
            "due_reviews": decode_rows(due),
            "recent_error_patterns": decode_rows(errors),
            "active_workflow": decode_mapping(workflow),
            "recent_turns": decode_rows(recent_turns),
            "effective_config": config,
            "prompt_policy": {
                "include": [
                    "user_profile",
                    "context_summary",
                    "recent active memory",
                    "weak mastery",
                    "due reviews",
                    "recent error patterns",
                    "agent runtime state",
                    "active context refs",
                    "active workflow",
                    "recent 3-5 turns",
                ],
                "exclude": [
                    "complete conversation history",
                    "complete question bank",
                    "complete solutions",
                    "complete tool logs",
                ],
            },
        }

    def get_state_overview(self, user_id: str, session_id: str | None = None) -> dict[str, Any]:
        bootstrap = self.get_agent_bootstrap_context(user_id, session_id, limit=10)
        with self.database.read() as connection:
            wrong_count = connection.execute(
                "SELECT COUNT(*) AS value FROM question_attempt WHERE user_id = ? AND is_correct = 0",
                (user_id,),
            ).fetchone()["value"]
            attempt_count = connection.execute(
                "SELECT COUNT(*) AS value FROM question_attempt WHERE user_id = ?",
                (user_id,),
            ).fetchone()["value"]
            pending = connection.execute(
                """
                SELECT * FROM pending_state_delta
                WHERE user_id = ? AND validation_status IN ('pending', 'approved')
                ORDER BY created_at DESC LIMIT 20
                """,
                (user_id,),
            ).fetchall()
            last_tool = connection.execute(
                """
                SELECT * FROM tool_call_log
                WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            last_workflow = connection.execute(
                """
                SELECT * FROM workflow_run
                WHERE user_id = ? ORDER BY started_at DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        return {
            "recent_learning": self.query_recent_learning(user_id, 10),
            "attempt_statistics": {
                "attempt_count": int(attempt_count),
                "wrong_count": int(wrong_count),
            },
            "wrong_questions": self.query_wrong_questions(user_id, limit=10),
            "weak_mastery_items": bootstrap["weak_mastery_items"],
            "error_patterns": bootstrap["recent_error_patterns"],
            "next_reviews": self.query_review_schedules(user_id, limit=10),
            "due_reviews": bootstrap["due_reviews"],
            "current_workflow": decode_mapping(last_workflow),
            "last_tool_call": decode_mapping(last_tool),
            "last_tool_call_succeeded": (
                bool(last_tool and last_tool["status"] == "succeeded")
            ),
            "prompt_bootstrap": bootstrap,
            "unverified_state_changes": decode_rows(pending),
        }
