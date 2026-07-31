from __future__ import annotations

import sqlite3
from typing import Any, Iterable, Mapping
from uuid import uuid4

from tracetutor_state.errors import ConflictError, DomainValidationError, NotFoundError
from tracetutor_state.json_utils import decode_mapping, decode_rows, dumps
from tracetutor_state.services.config_service import ConfigService
from tracetutor_state.services.state_rules import DiversityEvidence, RuleConfig, sqlite_timestamp

MASTERY_ENTITY_TYPES = {
    "knowledge_point",
    "method",
    "question_type",
    "structure",
    "thinking_pattern",
}
REVIEW_TARGET_TYPES = MASTERY_ENTITY_TYPES | {"question", "error_pattern"}


class StateBaseMixin:
    database: Any
    asset_validator: Any

    @staticmethod
    def _new_id(value: str | None = None) -> str:
        return value or str(uuid4())

    @staticmethod
    def _require(row: sqlite3.Row | None, label: str) -> sqlite3.Row:
        if row is None:
            raise NotFoundError(f"{label} not found")
        return row

    @staticmethod
    def _handle_integrity(exc: sqlite3.IntegrityError) -> None:
        message = str(exc)
        validation_markers = (
            "session_user_mismatch",
            "attempt_user_mismatch",
            "workflow_user_mismatch",
            "review_user_mismatch",
            "review_schedule_user_mismatch",
            "review_schedule_target_mismatch",
            "mastery_user_mismatch",
        )
        if any(marker in message for marker in validation_markers):
            raise DomainValidationError(message) from exc
        if "FOREIGN KEY" in message:
            raise DomainValidationError(
                "Referenced user/session/attempt/review/workflow does not exist"
            ) from exc
        if "UNIQUE" in message or "PRIMARY KEY" in message:
            raise ConflictError(message) from exc
        raise DomainValidationError(message) from exc

    @staticmethod
    def _rule_config(
        connection: sqlite3.Connection,
        user_id: str | None,
        session_id: str | None,
    ) -> RuleConfig:
        values = ConfigService.effective_bundle_from_connection(
            connection, user_id=user_id, session_id=session_id
        )
        return RuleConfig.from_mapping(values)

    @staticmethod
    def _attempt_result(attempt: Mapping[str, Any]) -> str:
        if attempt["is_correct"] is not None:
            return "success" if int(attempt["is_correct"]) == 1 else "fail"
        if attempt["score"] is not None:
            score = float(attempt["score"])
            if score >= 0.80:
                return "success"
            if score <= 0.30:
                return "fail"
            return "partial"
        raise DomainValidationError("attempt has no verifiable grading result")

    def _validate_attempt_evidence(
        self,
        attempt: Mapping[str, Any],
        tags: Iterable[Mapping[str, Any]],
    ) -> None:
        if not attempt["question_id"]:
            raise DomainValidationError("attempt is missing question_id")
        self._attempt_result(attempt)
        tag_list = list(tags)
        if not tag_list:
            raise DomainValidationError("attempt has no question_attempt_tag evidence")
        if attempt["source_type"] == "pgsql":
            for tag in tag_list:
                if tag["tag_type"] in {"knowledge_point", "method"} and not tag["tag_id"]:
                    raise DomainValidationError(
                        f"PgSQL attempt tag {tag['tag_type']}:{tag['tag_name']} is missing tag_id"
                    )

    def _diversity_evidence(
        self,
        connection: sqlite3.Connection,
        user_id: str,
        entity_type: str,
        entity_name: str,
    ) -> DiversityEvidence:
        base = connection.execute(
            """
            SELECT COUNT(DISTINCT a.question_id) AS distinct_questions,
                   COUNT(DISTINCT a.difficulty_level) AS distinct_difficulties
            FROM question_attempt a
            JOIN question_attempt_tag e ON e.attempt_id = a.id
            WHERE a.user_id = ?
              AND (a.is_correct IS NOT NULL OR a.score IS NOT NULL)
              AND e.tag_type = ? AND e.tag_name = ?
            """,
            (user_id, entity_type, entity_name),
        ).fetchone()
        structures = connection.execute(
            """
            SELECT COUNT(DISTINCT s.tag_name) AS value
            FROM question_attempt a
            JOIN question_attempt_tag e ON e.attempt_id = a.id
            JOIN question_attempt_tag s ON s.attempt_id = a.id AND s.tag_type = 'structure'
            WHERE a.user_id = ?
              AND (a.is_correct IS NOT NULL OR a.score IS NOT NULL)
              AND e.tag_type = ? AND e.tag_name = ?
            """,
            (user_id, entity_type, entity_name),
        ).fetchone()
        methods = connection.execute(
            """
            SELECT COUNT(DISTINCT m.tag_name) AS value
            FROM question_attempt a
            JOIN question_attempt_tag e ON e.attempt_id = a.id
            JOIN question_attempt_tag m ON m.attempt_id = a.id AND m.tag_type = 'method'
            WHERE a.user_id = ?
              AND (a.is_correct IS NOT NULL OR a.score IS NOT NULL)
              AND e.tag_type = ? AND e.tag_name = ?
            """,
            (user_id, entity_type, entity_name),
        ).fetchone()
        return DiversityEvidence(
            distinct_questions=int(base["distinct_questions"] or 0),
            distinct_structures=int(structures["value"] or 0),
            distinct_difficulties=int(base["distinct_difficulties"] or 0),
            distinct_methods=int(methods["value"] or 0),
        )

    @staticmethod
    def _attempts_with_tags(
        connection: sqlite3.Connection, attempts: Iterable[Mapping[str, Any]]
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for attempt in attempts:
            item = decode_mapping(attempt) or {}
            tags = connection.execute(
                "SELECT * FROM question_attempt_tag WHERE attempt_id = ? ORDER BY tag_type, role",
                (attempt["id"],),
            ).fetchall()
            item["tags"] = decode_rows(tags)
            result.append(item)
        return result

    @staticmethod
    def _write_local_event(
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
