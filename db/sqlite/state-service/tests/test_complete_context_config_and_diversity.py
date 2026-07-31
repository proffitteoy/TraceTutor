from __future__ import annotations

from uuid import uuid4


def setup(client):
    user_id = str(uuid4())
    client.post(
        "/api/v1/state/users",
        json={"user_id": user_id, "display_name": "状态测试", "current_subject": "高等数学"},
    )
    session = client.post(
        "/api/v1/state/sessions",
        json={"user_id": user_id, "session_type": "mixed", "subject": "高等数学", "topic": "极限"},
    ).json()
    return user_id, session["id"]


def add_success(client, user_id, session_id, entity_name, structure, difficulty):
    question_id = str(uuid4())
    attempt = client.post(
        "/api/v1/state/attempts",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "question_id": question_id,
            "is_correct": True,
            "score": 1.0,
            "difficulty_level": difficulty,
        },
    ).json()
    tags = {
        "tags": [
            {
                "tag_type": "knowledge_point",
                "tag_id": str(uuid4()),
                "tag_name": entity_name,
                "role": "primary",
            },
            {"tag_type": "structure", "tag_name": structure, "role": "primary"},
        ]
    }
    assert client.post(f"/api/v1/state/attempts/{attempt['id']}/tags", json=tags).status_code == 200
    result = client.post(f"/api/v1/state/attempts/{attempt['id']}/apply-state")
    assert result.status_code == 200, result.text
    return result.json()


def test_system_kv_precedence_and_rules_are_dynamic(client):
    user_id, session_id = setup(client)
    # User-scoped alpha overrides global; session-scoped alpha overrides user.
    assert client.put(
        "/api/v1/config/values",
        json={"key": "mastery_alpha", "value": 0.14, "scope": "user", "owner_id": user_id},
    ).status_code == 200
    assert client.put(
        "/api/v1/config/values",
        json={"key": "mastery_alpha", "value": 0.15, "scope": "session", "owner_id": session_id},
    ).status_code == 200
    effective = client.get(
        "/api/v1/config/effective", params={"user_id": user_id, "session_id": session_id}
    ).json()
    assert effective["mastery_alpha"] == 0.15

    result = add_success(
        client, user_id, session_id, "动态配置知识点", "structure.a", 2
    )
    update = next(
        item for item in result["mastery_updates"] if item["entity_name"] == "动态配置知识点"
    )
    # initial prior 0.5 + 0.15 * 1.0 * (1 - 0.5) = 0.575
    assert update["new_mastery_score"] == 0.575


def test_mastered_requires_question_structure_and_difficulty_diversity(client):
    user_id, session_id = setup(client)
    overrides = {
        "mastery_alpha": 0.15,
        "confidence_gain": 0.20,
        "mastered_score_threshold": 0.70,
        "mastered_confidence_threshold": 0.70,
        "mastered_min_exposures": 5,
        "mastered_min_distinct_questions": 5,
        "mastered_min_distinct_structures": 2,
        "mastered_min_distinct_difficulties": 2,
    }
    for key, value in overrides.items():
        response = client.put(
            "/api/v1/config/values",
            json={"key": key, "value": value, "scope": "user", "owner_id": user_id},
        )
        assert response.status_code == 200, response.text

    for _ in range(5):
        add_success(client, user_id, session_id, "单一结构", "same.structure", 3)
    uniform = client.get(
        f"/api/v1/state/users/{user_id}/mastery/detail",
        params={"entity_type": "knowledge_point", "entity_name": "单一结构"},
    ).json()
    assert uniform["state"]["mastery_score"] >= 0.70
    assert uniform["state"]["confidence_score"] > 0.70
    assert uniform["state"]["state_label"] != "mastered"
    assert uniform["diversity"]["distinct_structures"] == 1
    assert uniform["diversity"]["distinct_difficulties"] == 1

    for index in range(5):
        add_success(
            client,
            user_id,
            session_id,
            "多样结构",
            "structure.a" if index % 2 == 0 else "structure.b",
            2 if index % 2 == 0 else 4,
        )
    diverse = client.get(
        f"/api/v1/state/users/{user_id}/mastery/detail",
        params={"entity_type": "knowledge_point", "entity_name": "多样结构"},
    ).json()
    assert diverse["state"]["state_label"] == "mastered"
    assert diverse["diversity"]["distinct_questions"] == 5
    assert diverse["diversity"]["distinct_structures"] == 2
    assert diverse["diversity"]["distinct_difficulties"] == 2


def test_bootstrap_contains_all_short_term_sources_and_runtime(client):
    user_id, session_id = setup(client)
    client.put(
        "/api/v1/state/context-summary",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "summary_scope": "session",
            "summary_text": "用户正在复习极限。",
            "structured": {"current_topic": "极限"},
        },
    )
    for memory_type in ["working", "strategy", "warning", "open_loop"]:
        client.post(
            "/api/v1/state/memories",
            json={
                "user_id": user_id,
                "memory_type": memory_type,
                "title": memory_type,
                "content_text": f"{memory_type} content",
                "importance_score": 0.8,
            },
        )
    client.put(
        "/api/v1/state/active-context",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "ref_type": "active_question",
            "ref_id": str(uuid4()),
            "ref_name": "当前题",
        },
    )
    runtime = client.put(
        "/api/v1/system/runtime-state",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "agent_name": "main_agent",
            "state_key": "current_step",
            "state_value": {"value": "WAITING_USER_ANSWER"},
        },
    )
    assert runtime.status_code == 200
    workflow = client.post(
        "/api/v1/system/workflows",
        json={
            "user_id": user_id,
            "session_id": session_id,
            "workflow_name": "review",
            "current_step": "WAITING_USER_ANSWER",
        },
    )
    assert workflow.status_code == 201

    bootstrap = client.get(
        f"/api/v1/state/users/{user_id}/bootstrap-context",
        params={"session_id": session_id, "limit": 10},
    ).json()
    memory_types = {item["memory_type"] for item in bootstrap["recent_active_memories"]}
    assert {"working", "strategy", "warning", "open_loop"}.issubset(memory_types)
    assert bootstrap["agent_runtime_state"]["main_agent"]["current_step"]["value"] == "WAITING_USER_ANSWER"
    assert bootstrap["active_context"][0]["ref_type"] == "active_question"
    assert bootstrap["active_workflow"]["workflow_name"] == "review"
    assert "complete conversation history" in bootstrap["prompt_policy"]["exclude"]


def test_context_compression_trigger_detects_turn_and_token_threshold(client):
    user_id, session_id = setup(client)
    client.put(
        "/api/v1/config/values",
        json={"key": "max_context_turns", "value": 2, "scope": "session", "owner_id": session_id},
    )
    client.put(
        "/api/v1/config/values",
        json={"key": "context_compress_threshold_tokens", "value": 100, "scope": "session", "owner_id": session_id},
    )
    for role in ["user", "assistant"]:
        client.post(
            "/api/v1/state/turns",
            json={
                "user_id": user_id,
                "session_id": session_id,
                "role": role,
                "content_text": "对话内容",
                "token_estimate": 60,
            },
        )
    status = client.get(
        f"/api/v1/state/users/{user_id}/sessions/{session_id}/compression-status"
    ).json()
    assert status["should_compress"] is True
    assert "turn_count_threshold" in status["reasons"]
    assert "token_threshold" in status["reasons"]
