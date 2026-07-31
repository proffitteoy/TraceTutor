from uuid import uuid4


def test_agent_mastery_claim_without_fact_is_rejected(client):
    user_id = str(uuid4())
    client.post(
        "/api/v1/state/users",
        json={"user_id": user_id, "display_name": "无证据测试"},
    )

    delta = client.post(
        "/api/v1/state/deltas",
        json={
            "user_id": user_id,
            "delta_type": "mastery_update",
            "proposed_by": "agent",
            "delta": {
                "entity_type": "method",
                "entity_name": "夹逼估计",
                "mastery_change": 0.2,
                "evidence": "用户似乎理解了",
            },
        },
    )
    assert delta.status_code == 201

    result = client.post(
        f"/api/v1/state/deltas/{delta.json()['id']}/validate-and-apply"
    )
    assert result.status_code == 200
    body = result.json()
    assert body["validation_status"] == "rejected"
    assert "No verifiable fact path" in body["validation_reason"]

    assert client.get(
        f"/api/v1/state/users/{user_id}/weak-items"
    ).json() == []
