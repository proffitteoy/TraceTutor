from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from tracetutor_state.main import create_app


def setup(client):
    user_id = str(uuid4())
    client.post("/api/v1/state/users", json={"user_id": user_id, "display_name": "查询测试"})
    session = client.post(
        "/api/v1/state/sessions",
        json={"user_id": user_id, "session_type": "review", "topic": "极限"},
    ).json()
    return user_id, session["id"]


def test_system_observability_and_overview_answer_final_pdf_questions(client):
    user_id, session_id = setup(client)
    workflow = client.post(
        "/api/v1/system/workflows",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "workflow_name": "review",
            "current_step": "TOOLS_CALLED",
            "input": {"intent": "review"},
        },
    ).json()
    tool = client.post(
        "/api/v1/system/tool-calls",
        json={
            "workflow_run_id": workflow["id"],
            "user_id": user_id,
            "session_id": session_id,
            "tool_name": "state.query_review_due_items",
            "input": {"limit": 5},
            "output_summary": {"count": 0},
            "status": "succeeded",
            "latency_ms": 12,
        },
    )
    assert tool.status_code == 201
    last = client.get(f"/api/v1/system/users/{user_id}/last-tool-call").json()
    assert last["succeeded"] is True
    current = client.get(
        f"/api/v1/system/users/{user_id}/current-workflow",
        params={"session_id": session_id},
    ).json()
    assert current["current_step"] == "TOOLS_CALLED"

    overview = client.get(
        f"/api/v1/state/users/{user_id}/overview",
        params={"session_id": session_id},
    )
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["last_tool_call_succeeded"] is True
    assert body["current_workflow"]["id"] == workflow["id"]
    assert "unverified_state_changes" in body
    assert "prompt_bootstrap" in body


def test_question_level_review_uses_tag_snapshot(client):
    user_id, session_id = setup(client)
    question_id = str(uuid4())
    response = client.post(
        "/api/v1/state/reviews",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "review_type": "old_question_review",
            "target_type": "question",
            "target_id": question_id,
            "target_name": "旧题 Q",
            "result": "partial",
            "score": 0.6,
            "evidence_tags": [
                {
                    "tag_type": "knowledge_point",
                    "tag_id": str(uuid4()),
                    "tag_name": "函数极限",
                    "role": "primary",
                },
                {
                    "tag_type": "method",
                    "tag_id": str(uuid4()),
                    "tag_name": "夹逼估计",
                    "role": "primary",
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["mastery_updates"]) == 2
    assert body["review_schedule"]["target_type"] == "question"
    mastery = client.get(
        f"/api/v1/state/users/{user_id}/mastery",
        params={"entity_type": "method"},
    ).json()
    assert mastery[0]["entity_name"] == "夹逼估计"


def test_explanation_endpoints_are_replayable(client):
    user_id, session_id = setup(client)
    attempt = client.post(
        "/api/v1/state/attempts",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "question_id": str(uuid4()),
            "is_correct": False,
            "score": 0,
            "main_error_type": "knowledge_gap",
            "error_detail_text": "定义不清",
            "difficulty_level": 3,
        },
    ).json()
    client.post(
        f"/api/v1/state/attempts/{attempt['id']}/tags",
        json={"tags": [{"tag_type": "knowledge_point", "tag_id": str(uuid4()), "tag_name": "函数极限", "role": "primary"}]},
    )
    client.post(f"/api/v1/state/attempts/{attempt['id']}/apply-state")
    mastery = client.get(
        f"/api/v1/state/users/{user_id}/mastery/explain",
        params={"entity_type": "knowledge_point", "entity_name": "函数极限"},
    )
    assert mastery.status_code == 200
    assert mastery.json()["latest_change"]["attempt_id"] == attempt["id"]
    schedule = client.get(f"/api/v1/state/users/{user_id}/review-schedules").json()[0]
    explanation = client.get(
        f"/api/v1/state/review-schedules/{schedule['id']}/explain"
    ).json()
    assert explanation["priority_components"]
    assert "0.35" in explanation["priority_formula"]
    events = client.get(f"/api/v1/state/users/{user_id}/events").json()
    assert any(item["event_type"] == "mastery_updated" for item in events)


def test_asset_uuid_contract_mode_rejects_invalid_cross_database_ids(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TRACE_TUTOR_ASSET_VALIDATION_MODE", "format")
    app = create_app(db_path=tmp_path / "format.db")
    with TestClient(app) as client:
        user_id = str(uuid4())
        client.post("/api/v1/state/users", json={"user_id": user_id})
        invalid = client.post(
            "/api/v1/state/attempts",
            json={"user_id": user_id, "question_id": "Q123", "is_correct": True},
        )
        assert invalid.status_code == 422
        valid = client.post(
            "/api/v1/state/attempts",
            json={"user_id": user_id, "question_id": str(uuid4()), "is_correct": True},
        )
        assert valid.status_code == 201
    monkeypatch.delenv("TRACE_TUTOR_ASSET_VALIDATION_MODE", raising=False)


def test_schema_pragmas_tables_indexes_and_openapi(client):
    database = client.app.state.database
    with database.read() as connection:
        pragmas = {
            "foreign_keys": connection.execute("PRAGMA foreign_keys").fetchone()[0],
            "journal_mode": connection.execute("PRAGMA journal_mode").fetchone()[0],
            "synchronous": connection.execute("PRAGMA synchronous").fetchone()[0],
            "busy_timeout": connection.execute("PRAGMA busy_timeout").fetchone()[0],
        }
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        indexes = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
            )
        }
    required_tables = {
        "schema_migration", "user_profile", "learning_session", "conversation_turn",
        "question_attempt", "question_attempt_tag", "review_event", "mastery_state",
        "mastery_event", "error_pattern_state", "review_schedule", "context_summary",
        "agent_memory_item", "active_context_ref", "agent_runtime_state", "workflow_run",
        "tool_call_log", "pending_state_delta", "system_kv", "local_event_log",
    }
    assert required_tables.issubset(tables)
    assert pragmas["foreign_keys"] == 1
    assert pragmas["journal_mode"].lower() == "wal"
    assert pragmas["synchronous"] == 1  # NORMAL
    assert pragmas["busy_timeout"] == 5000
    assert "idx_review_user_due" in indexes
    assert "idx_delta_status" in indexes

    schema = client.get("/openapi.json").json()
    operation_ids = []
    for path in schema["paths"].values():
        for method, operation in path.items():
            if method in {"get", "post", "put", "patch", "delete"}:
                operation_ids.append(operation["operationId"])
    assert len(operation_ids) == len(set(operation_ids))
    assert "state_get_agent_bootstrap_context" in operation_ids
    assert "state_validate_and_apply_delta" in operation_ids
    assert "system_write_tool_call" in operation_ids


def test_mastery_event_history_is_replayable(client):
    user_id, session_id = setup(client)
    question_id = str(uuid4())
    attempt = client.post(
        "/api/v1/state/attempts",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "question_id": question_id,
            "is_correct": False,
            "score": 0.0,
            "main_error_type": "method_selection_error",
            "error_detail_text": "不会构造上下界",
        },
    ).json()
    client.post(
        f"/api/v1/state/attempts/{attempt['id']}/tags",
        json={
            "tags": [
                {
                    "tag_type": "method",
                    "tag_id": str(uuid4()),
                    "tag_name": "夹逼估计",
                    "role": "primary",
                }
            ]
        },
    )
    assert client.post(f"/api/v1/state/attempts/{attempt['id']}/apply-state").status_code == 200
    replay = client.get(
        f"/api/v1/state/users/{user_id}/mastery/replay",
        params={"entity_type": "method", "entity_name": "夹逼估计"},
    )
    assert replay.status_code == 200, replay.text
    body = replay.json()
    assert body["event_count"] == 1
    assert body["matches_snapshot"] is True
    assert body["anomalies"] == []
