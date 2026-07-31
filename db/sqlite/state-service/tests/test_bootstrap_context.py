from uuid import uuid4


def test_bootstrap_context_returns_compressed_state_not_full_history(client):
    user_id = str(uuid4())
    client.post(
        "/api/v1/state/users",
        json={
            "user_id": user_id,
            "display_name": "上下文测试",
            "current_subject": "高等数学",
            "preferences": {"show_solution_steps": True},
        },
    )
    session = client.post(
        "/api/v1/state/sessions",
        json={
            "user_id": user_id,
            "session_type": "review",
            "subject": "高等数学",
            "topic": "极限",
        },
    ).json()

    client.put(
        "/api/v1/state/context-summary",
        json={
            "user_id": user_id,
            "session_id": session["id"],
            "summary_scope": "session",
            "summary_text": "用户正在复习数列极限，夹逼结构识别仍不稳定。",
            "structured": {"recent_focus": ["数列极限", "夹逼估计"]},
        },
    )
    client.post(
        "/api/v1/state/memories",
        json={
            "user_id": user_id,
            "memory_type": "open_loop",
            "title": "夹逼法复习未闭合",
            "content_text": "需要再做一道题面变化较大的夹逼题。",
            "importance_score": 0.9,
        },
    )
    client.put(
        "/api/v1/state/active-context",
        json={
            "user_id": user_id,
            "session_id": session["id"],
            "ref_type": "active_topic",
            "ref_id": "topic-limit",
            "ref_name": "极限",
        },
    )

    response = client.get(
        f"/api/v1/state/users/{user_id}/bootstrap-context",
        params={"session_id": session["id"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user_snapshot"]["current_subject"] == "高等数学"
    assert "夹逼结构识别" in body["session_summary"]["summary_text"]
    assert body["open_loops"][0]["title"] == "夹逼法复习未闭合"
    assert body["active_context"][0]["ref_name"] == "极限"
    assert "conversation_turn" not in body
