#!/usr/bin/env python3
"""Run a complete SQLite-state flow against a running local API."""

from __future__ import annotations

import json
import os
from typing import Any
from uuid import uuid4

import httpx

BASE_URL = os.getenv("TRACE_TUTOR_SQLITE_SERVICE_URL", "http://127.0.0.1:8000")
SERVICE_TOKEN = os.getenv("TRACE_TUTOR_SQLITE_SERVICE_TOKEN", "")


def request(
    client: httpx.Client,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Any:
    response = client.request(method, path, json=payload, **kwargs)
    response.raise_for_status()
    if not response.content:
        return None
    return response.json()


def main() -> None:
    user_id = str(uuid4())
    question_id = str(uuid4())
    knowledge_id = str(uuid4())
    method_id = str(uuid4())
    headers = (
        {"Authorization": f"Bearer {SERVICE_TOKEN}"}
        if SERVICE_TOKEN
        else None
    )

    with httpx.Client(base_url=BASE_URL, timeout=15.0, headers=headers) as client:
        health = request(client, "GET", "/health")
        user = request(
            client,
            "POST",
            "/api/v1/state/users",
            {
                "user_id": user_id,
                "display_name": "完整演示用户",
                "current_subject": "高等数学",
                "current_stage": "大学一年级",
                "preferences": {
                    "explanation_style": "先整体框架，再细节推导",
                    "show_solution_steps": True,
                },
            },
        )
        session = request(
            client,
            "POST",
            "/api/v1/state/sessions",
            {
                "user_id": user_id,
                "session_type": "mixed",
                "subject": "高等数学",
                "topic": "极限",
            },
        )
        workflow = request(
            client,
            "POST",
            "/api/v1/system/workflows",
            {
                "user_id": user_id,
                "session_id": session["id"],
                "workflow_name": "review_and_variant",
                "current_step": "STATE_DELTA_READY",
                "input": {"intent": "REVIEW_AND_VARIANT"},
            },
        )
        attempt = request(
            client,
            "POST",
            "/api/v1/state/attempts",
            {
                "user_id": user_id,
                "session_id": session["id"],
                "question_id": question_id,
                "source_type": "pgsql",
                "user_answer_text": "1",
                "is_correct": False,
                "score": 0,
                "time_spent_seconds": 180,
                "difficulty_level": 3,
                "main_error_type": "method_selection_error",
                "error_detail_text": "不会主动构造上下界",
            },
        )
        request(
            client,
            "POST",
            f"/api/v1/state/attempts/{attempt['id']}/tags",
            {
                "tags": [
                    {
                        "tag_type": "knowledge_point",
                        "tag_id": knowledge_id,
                        "tag_name": "数列极限",
                        "role": "primary",
                    },
                    {
                        "tag_type": "method",
                        "tag_id": method_id,
                        "tag_name": "夹逼估计",
                        "role": "primary",
                    },
                    {
                        "tag_type": "structure",
                        "tag_name": "给定不等式求极限",
                        "role": "primary",
                    },
                    {
                        "tag_type": "thinking_pattern",
                        "tag_name": "主动构造上下界",
                        "role": "hidden",
                        "confidence": 0.9,
                    },
                ]
            },
        )
        state_application = request(
            client,
            "POST",
            f"/api/v1/state/attempts/{attempt['id']}/apply-state",
        )

        method_update = next(
            item
            for item in state_application["mastery_updates"]
            if item["entity_name"] == "夹逼估计"
        )
        review = request(
            client,
            "POST",
            "/api/v1/state/reviews",
            {
                "user_id": user_id,
                "session_id": session["id"],
                "schedule_id": method_update["review_schedule"]["id"],
                "review_type": "method_transfer",
                "target_type": "method",
                "target_id": method_id,
                "target_name": "夹逼估计",
                "result": "success",
                "score": 1.0,
                "agent_review_summary": "用户在复习中正确识别并使用夹逼方法。",
            },
        )

        ungrounded = request(
            client,
            "POST",
            "/api/v1/state/deltas",
            {
                "user_id": user_id,
                "session_id": session["id"],
                "workflow_run_id": workflow["id"],
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
        ungrounded_result = request(
            client,
            "POST",
            f"/api/v1/state/deltas/{ungrounded['id']}/validate-and-apply",
        )

        memory_delta = request(
            client,
            "POST",
            "/api/v1/state/deltas",
            {
                "user_id": user_id,
                "session_id": session["id"],
                "workflow_run_id": workflow["id"],
                "delta_type": "memory_update",
                "proposed_by": "agent",
                "delta": {
                    "memory_type": "open_loop",
                    "title": "继续做结构变化题",
                    "content_text": "下一轮需要一道题面变化更大的夹逼题。",
                    "importance_score": 0.85,
                },
            },
        )
        memory_result = request(
            client,
            "POST",
            f"/api/v1/state/deltas/{memory_delta['id']}/validate-and-apply",
        )

        request(
            client,
            "PUT",
            "/api/v1/system/runtime-state",
            {
                "user_id": user_id,
                "session_id": session["id"],
                "agent_name": "main_agent",
                "state_key": "current_step",
                "state_value": {"value": "DONE"},
            },
        )
        request(
            client,
            "POST",
            "/api/v1/system/tool-calls",
            {
                "workflow_run_id": workflow["id"],
                "user_id": user_id,
                "session_id": session["id"],
                "tool_name": "state.update_mastery_from_attempt",
                "input": {"attempt_id": attempt["id"]},
                "output_summary": {
                    "validation_status": state_application["validation_status"],
                    "updated_entities": len(state_application["mastery_updates"]),
                },
                "status": "succeeded",
                "latency_ms": 12,
            },
        )
        request(
            client,
            "PATCH",
            f"/api/v1/system/workflows/{workflow['id']}",
            {
                "status": "succeeded",
                "current_step": "DONE",
                "output": {"state_write_status": "applied"},
            },
        )

        replay = request(
            client,
            "GET",
            f"/api/v1/state/users/{user_id}/mastery/replay",
            params={"entity_type": "method", "entity_name": "夹逼估计"},
        )
        bootstrap = request(
            client,
            "GET",
            f"/api/v1/state/users/{user_id}/bootstrap-context",
            params={"session_id": session["id"]},
        )
        overview = request(
            client,
            "GET",
            f"/api/v1/state/users/{user_id}/overview",
            params={"session_id": session["id"]},
        )

    print(
        json.dumps(
            {
                "health": health,
                "user": user,
                "session": session,
                "workflow": workflow,
                "attempt": attempt,
                "attempt_state": state_application,
                "review": review,
                "ungrounded_delta": ungrounded_result,
                "memory_delta": memory_result,
                "mastery_replay": replay,
                "bootstrap_context": bootstrap,
                "overview": overview,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
