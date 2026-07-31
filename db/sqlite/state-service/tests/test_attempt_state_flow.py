from uuid import uuid4


def test_checked_attempt_updates_mastery_review_and_error_pattern(client):
    user_id = str(uuid4())
    question_id = str(uuid4())
    knowledge_id = str(uuid4())
    method_id = str(uuid4())

    assert client.post(
        "/api/v1/state/users",
        json={
            "user_id": user_id,
            "display_name": "测试用户",
            "current_subject": "高等数学",
        },
    ).status_code == 201

    session = client.post(
        "/api/v1/state/sessions",
        json={
            "user_id": user_id,
            "session_type": "new_question",
            "subject": "高等数学",
            "topic": "极限",
        },
    ).json()

    attempt = client.post(
        "/api/v1/state/attempts",
        json={
            "user_id": user_id,
            "session_id": session["id"],
            "question_id": question_id,
            "user_answer_text": "1",
            "is_correct": False,
            "score": 0,
            "main_error_type": "method_selection_error",
            "error_detail_text": "不会主动构造上下界",
        },
    ).json()

    response = client.post(
        f"/api/v1/state/attempts/{attempt['id']}/tags",
        json={
            "tags": [
                {
                    "tag_type": "knowledge_point",
                    "tag_id": knowledge_id,
                    "tag_name": "数列极限",
                    "role": "primary",
                    "weight": 1.0,
                },
                {
                    "tag_type": "method",
                    "tag_id": method_id,
                    "tag_name": "夹逼估计",
                    "role": "primary",
                    "weight": 1.0,
                },
                {
                    "tag_type": "thinking_pattern",
                    "tag_name": "主动构造上下界",
                    "role": "hidden",
                    "weight": 0.9,
                },
            ]
        },
    )
    assert response.status_code == 200

    applied = client.post(
        f"/api/v1/state/attempts/{attempt['id']}/apply-state"
    )
    assert applied.status_code == 200
    payload = applied.json()
    assert payload["validation_status"] == "applied"
    assert len(payload["mastery_updates"]) == 3
    assert payload["error_pattern_update"]["occurrence_count"] == 1

    wrong_questions = client.get(
        f"/api/v1/state/users/{user_id}/wrong-questions",
        params={"tag_name": "数列极限"},
    ).json()
    assert wrong_questions[0]["question_id"] == question_id
    assert wrong_questions[0]["tags"]

    weak = client.get(f"/api/v1/state/users/{user_id}/weak-items").json()
    assert {item["entity_name"] for item in weak} >= {
        "数列极限",
        "夹逼估计",
        "主动构造上下界",
    }

    # Retried HTTP calls must not double-count the attempt.
    second = client.post(
        f"/api/v1/state/attempts/{attempt['id']}/apply-state"
    ).json()
    assert second["idempotent"] is True
