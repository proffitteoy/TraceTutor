from uuid import uuid4


def test_attempt_cannot_use_another_users_session(client):
    user_a = str(uuid4())
    user_b = str(uuid4())
    client.post("/api/v1/state/users", json={"user_id": user_a})
    client.post("/api/v1/state/users", json={"user_id": user_b})
    session_b = client.post(
        "/api/v1/state/sessions",
        json={"user_id": user_b, "session_type": "new_question"},
    ).json()

    response = client.post(
        "/api/v1/state/attempts",
        json={
            "user_id": user_a,
            "session_id": session_b["id"],
            "question_id": str(uuid4()),
            "is_correct": False,
        },
    )
    assert response.status_code == 422
    assert "session_user_mismatch" in response.json()["detail"]
