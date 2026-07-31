from uuid import uuid4


def test_workflow_and_tool_calls_are_auditable(client):
    user_id = str(uuid4())
    client.post(
        "/api/v1/state/users",
        json={"user_id": user_id, "display_name": "日志测试"},
    )
    session = client.post(
        "/api/v1/state/sessions",
        json={"user_id": user_id, "session_type": "review"},
    ).json()

    run = client.post(
        "/api/v1/system/workflows",
        json={
            "user_id": user_id,
            "session_id": session["id"],
            "workflow_name": "review",
            "input": {"intent": "SCHEDULED_REVIEW"},
            "current_step": "PLAN_CREATED",
        },
    )
    assert run.status_code == 201
    run_id = run.json()["id"]

    tool = client.post(
        "/api/v1/system/tool-calls",
        json={
            "workflow_run_id": run_id,
            "user_id": user_id,
            "session_id": session["id"],
            "tool_name": "state.query_review_due_items",
            "input": {"user_id": user_id, "limit": 5},
            "output_summary": {"count": 0},
            "status": "succeeded",
            "latency_ms": 12,
        },
    )
    assert tool.status_code == 201

    client.patch(
        f"/api/v1/system/workflows/{run_id}",
        json={
            "status": "succeeded",
            "current_step": "DONE",
            "output": {"cards": []},
        },
    )
    fetched = client.get(f"/api/v1/system/workflows/{run_id}").json()
    assert fetched["status"] == "succeeded"
    assert fetched["tool_calls"][0]["tool_name"] == "state.query_review_due_items"
