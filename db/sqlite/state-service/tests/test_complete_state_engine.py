from __future__ import annotations

from uuid import uuid4


def create_user_session(client, topic="极限"):
    user_id = str(uuid4())
    assert client.post(
        "/api/v1/state/users",
        json={"user_id": user_id, "display_name": "完整测试", "current_subject": "高等数学"},
    ).status_code == 201
    session = client.post(
        "/api/v1/state/sessions",
        json={
            "user_id": user_id,
            "session_type": "new_question",
            "subject": "高等数学",
            "topic": topic,
        },
    ).json()
    return user_id, session["id"]


def make_attempt(client, user_id, session_id, *, correct, name="数列极限", error=None, difficulty=3):
    attempt = client.post(
        "/api/v1/state/attempts",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "question_id": str(uuid4()),
            "is_correct": correct,
            "score": 1.0 if correct else 0.0,
            "difficulty_level": difficulty,
            "main_error_type": "method_selection_error" if not correct else None,
            "error_detail_text": error,
        },
    ).json()
    response = client.post(
        f"/api/v1/state/attempts/{attempt['id']}/tags",
        json={
            "tags": [
                {
                    "tag_type": "knowledge_point",
                    "tag_id": str(uuid4()),
                    "tag_name": name,
                    "role": "primary",
                },
                {
                    "tag_type": "structure",
                    "tag_name": "limit.sequence.squeeze",
                    "role": "primary",
                },
            ]
        },
    )
    assert response.status_code == 200, response.text
    return attempt


def test_review_bundle_updates_all_required_state(client):
    user_id, session_id = create_user_session(client)
    attempt = make_attempt(
        client,
        user_id,
        session_id,
        correct=False,
        error="不会主动构造上下界",
    )
    applied = client.post(f"/api/v1/state/attempts/{attempt['id']}/apply-state")
    assert applied.status_code == 200, applied.text

    errors_before = client.get(f"/api/v1/state/users/{user_id}/error-patterns").json()
    assert errors_before[0]["status"] == "active"
    resolved_before = errors_before[0]["resolved_score"]

    review = client.post(
        "/api/v1/state/reviews",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "review_type": "same_knowledge_new_question",
            "target_type": "knowledge_point",
            "target_id": str(uuid4()),
            "target_name": "数列极限",
            "result": "success",
            "score": 1.0,
            "agent_review_summary": "复习成功",
        },
    )
    assert review.status_code == 201, review.text
    body = review.json()
    assert body["mastery_updates"][0]["review_schedule"]["review_count"] == 1
    assert body["state_applied_at"] is not None

    history = client.get(
        f"/api/v1/state/users/{user_id}/mastery/history",
        params={"entity_type": "knowledge_point", "entity_name": "数列极限"},
    ).json()
    assert any(item["delta_reason"] == "review_success" for item in history)

    errors_after = client.get(f"/api/v1/state/users/{user_id}/error-patterns").json()
    assert errors_after[0]["resolved_score"] > resolved_before
    assert errors_after[0]["status"] in {"improving", "resolved"}

    summaries = client.get(
        f"/api/v1/state/users/{user_id}/context-summaries",
        params={"session_id": session_id, "summary_scope": "session"},
    ).json()
    assert summaries and "复习" in summaries[0]["summary_text"]


def test_review_schedule_mismatch_is_validation_error_not_500(client):
    user_id, session_id = create_user_session(client)
    attempt = make_attempt(client, user_id, session_id, correct=False, error="错因")
    client.post(f"/api/v1/state/attempts/{attempt['id']}/apply-state")
    schedules = client.get(f"/api/v1/state/users/{user_id}/review-schedules").json()
    schedule = schedules[0]

    mismatch = client.post(
        "/api/v1/state/reviews",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "schedule_id": schedule["id"],
            "review_type": "method_transfer",
            "target_type": "method",
            "target_name": "泰勒展开",
            "result": "success",
        },
    )
    assert mismatch.status_code == 422
    assert "review_schedule_target_mismatch" in mismatch.json()["detail"]


def test_all_pending_delta_types_and_workflow_guard(client):
    user_id, session_id = create_user_session(client)

    # Formal mastery update from a checked attempt.
    attempt = make_attempt(client, user_id, session_id, correct=True)
    delta = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "attempt_id": attempt["id"],
            "delta_type": "mastery_update",
            "delta": {"entity_type": "knowledge_point", "entity_name": "数列极限", "mastery_change": 0.1},
        },
    ).json()
    applied = client.post(f"/api/v1/state/deltas/{delta['id']}/validate-and-apply").json()
    assert applied["validation_status"] == "applied"

    # Explicit error-pattern update from another failed fact.
    failed = make_attempt(client, user_id, session_id, correct=False, error="参数范围遗漏")
    err_delta = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "attempt_id": failed["id"],
            "delta_type": "error_pattern_update",
            "delta": {"error_pattern_name": "参数范围遗漏", "result": "fail"},
        },
    ).json()
    err_applied = client.post(
        f"/api/v1/state/deltas/{err_delta['id']}/validate-and-apply"
    ).json()
    assert err_applied["validation_status"] == "applied"
    assert err_applied["error_pattern"]["occurrence_count"] == 1

    # Explicit review schedule update tied to the same attempt tag evidence.
    schedule_delta = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "attempt_id": failed["id"],
            "delta_type": "review_schedule_update",
            "delta": {
                "target_type": "knowledge_point",
                "target_name": "数列极限",
                "importance_score": 1.0,
                "result": "fail",
            },
        },
    ).json()
    schedule_applied = client.post(
        f"/api/v1/state/deltas/{schedule_delta['id']}/validate-and-apply"
    ).json()
    assert schedule_applied["validation_status"] == "applied"
    assert schedule_applied["review_schedule"]["due_at"]

    # Soft memory update is allowed, but does not touch formal mastery.
    memory_delta = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "delta_type": "memory_update",
            "delta": {
                "memory_type": "open_loop",
                "title": "继续巩固",
                "content_text": "还需要一道题",
                "importance_score": 0.8,
            },
        },
    ).json()
    memory_applied = client.post(
        f"/api/v1/state/deltas/{memory_delta['id']}/validate-and-apply"
    ).json()
    assert memory_applied["validation_status"] == "applied"
    assert memory_applied["memory"]["memory_type"] == "open_loop"

    # A failed workflow may not write any delta.
    workflow = client.post(
        "/api/v1/system/workflows",
        json={"user_id": user_id, "session_id": session_id, "workflow_name": "review", "current_step": "TOOL_ERROR"},
    ).json()
    client.patch(
        f"/api/v1/system/workflows/{workflow['id']}",
        json={"status": "failed", "error_message": "tool failed"},
    )
    guarded = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "workflow_run_id": workflow["id"],
            "delta_type": "memory_update",
            "delta": {"memory_type": "warning", "title": "x", "content_text": "y"},
        },
    ).json()
    rejected = client.post(
        f"/api/v1/state/deltas/{guarded['id']}/validate-and-apply"
    ).json()
    assert rejected["validation_status"] == "rejected"
    assert "workflow status failed" in rejected["validation_reason"]


def test_illegal_mastery_change_is_rejected(client):
    user_id, session_id = create_user_session(client)
    attempt = make_attempt(client, user_id, session_id, correct=True)
    delta = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "attempt_id": attempt["id"],
            "delta_type": "mastery_update",
            "delta": {"mastery_change": 0.9},
        },
    ).json()
    result = client.post(f"/api/v1/state/deltas/{delta['id']}/validate-and-apply").json()
    assert result["validation_status"] == "rejected"
    assert "legal range" in result["validation_reason"]
