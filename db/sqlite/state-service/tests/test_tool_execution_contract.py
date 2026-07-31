from __future__ import annotations


def execute(client, tool: str, payload: dict, request_id: str = "REQ1"):
    return client.post(
        "/internal/tool-execution",
        json={
            "tool": tool,
            "input": payload,
            "context": {
                "request_id": request_id,
                "user_id": payload["user_id"],
                "session_id": payload["session_id"],
            },
        },
    )


def test_tool_execution_port_attempt_review_and_idempotency(client):
    scope = {"user_id": "U1", "session_id": "S1"}
    attempt_input = {
        **scope,
        "question_id": "Q1",
        "answer_text": "答案",
        "judgement": "incorrect",
        "knowledge_point_ids": ["KP1"],
        "method_ids": ["M1"],
        "client_event_id": "attempt-event-1",
    }

    first = execute(client, "state.write_attempt_result", attempt_input)
    assert first.status_code == 200
    first_result = first.json()["result"]
    assert first_result["idempotent"] is False
    assert len(first_result["pending_state_deltas"]) == 1

    duplicate = execute(client, "state.write_attempt_result", attempt_input)
    assert duplicate.status_code == 200
    duplicate_result = duplicate.json()["result"]
    assert duplicate_result["idempotent"] is True
    assert duplicate_result["attempt_id"] == first_result["attempt_id"]

    candidate = first_result["pending_state_deltas"][0]
    applied = execute(
        client,
        "state.apply_state_delta",
        {
            **scope,
            **candidate,
            "client_event_id": "attempt-event-1:0",
        },
    )
    assert applied.status_code == 200
    assert applied.json()["result"]["status"] == "applied"

    wrong = execute(
        client,
        "state.query_wrong_questions",
        {
            **scope,
            "knowledge_point_ids": ["KP1"],
            "state_labels": ["weak"],
            "recent_only": False,
            "limit": 5,
        },
    )
    assert wrong.status_code == 200
    assert wrong.json()["items"][0]["question_id"] == "Q1"

    due = execute(
        client,
        "state.query_review_due_items",
        {
            **scope,
            "due_before": "2099-01-01T00:00:00+00:00",
            "target_types": ["knowledge_point", "method"],
            "limit": 5,
        },
    )
    assert due.status_code == 200
    schedule_id = due.json()["items"][0]["id"]

    review = execute(
        client,
        "state.write_review_result",
        {
            **scope,
            "schedule_id": schedule_id,
            "question_id": "Q1",
            "attempt_id": first_result["attempt_id"],
            "outcome": "remembered",
            "client_event_id": "review-event-1",
        },
    )
    assert review.status_code == 200
    review_result = review.json()["result"]
    assert len(review_result["pending_state_deltas"]) == 1

    review_candidate = review_result["pending_state_deltas"][0]
    review_applied = execute(
        client,
        "state.apply_state_delta",
        {
            **scope,
            **review_candidate,
            "client_event_id": "review-event-1:0",
        },
    )
    assert review_applied.status_code == 200
    assert review_applied.json()["result"]["status"] == "applied"

    snapshot = execute(client, "state.query_user_snapshot", scope)
    assert snapshot.status_code == 200
    assert snapshot.json()["meta"]["source"] == "sqlite"


def test_tool_execution_rejects_spoofed_scope(client):
    response = client.post(
        "/internal/tool-execution",
        json={
            "tool": "state.query_user_snapshot",
            "input": {"user_id": "ATTACKER", "session_id": "S1"},
            "context": {
                "request_id": "REQ-SCOPE",
                "user_id": "U1",
                "session_id": "S1",
            },
        },
    )
    assert response.status_code == 422
