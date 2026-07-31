from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status

from tracetutor_state.api.dependencies import get_state_service
from tracetutor_state.schemas import (
    ActiveContextStatusUpdate,
    ActiveContextUpsert,
    AttemptCheck,
    AttemptCreate,
    AttemptTagsAttach,
    ContextSummaryWrite,
    MemoryCreate,
    MemoryUpdate,
    PendingDeltaCreate,
    ReviewEventCreate,
    SessionCreate,
    SessionUpdate,
    TurnCreate,
    UserCreate,
    UserUpdate,
)
from tracetutor_state.services import StateService

router = APIRouter(prefix="/api/v1/state", tags=["state"])


@router.post("/users", status_code=status.HTTP_201_CREATED, operation_id="state_create_user")
def create_user(payload: UserCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.create_user(payload)


@router.get("/users/{user_id}", operation_id="state_get_user")
def get_user(user_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_user(user_id)


@router.patch("/users/{user_id}", operation_id="state_update_user")
def update_user(user_id: str, payload: UserUpdate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.update_user(user_id, payload)


@router.post("/sessions", status_code=status.HTTP_201_CREATED, operation_id="state_create_session")
def create_session(payload: SessionCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.create_session(payload)


@router.get("/sessions/{session_id}", operation_id="state_get_session")
def get_session(session_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_session(session_id)


@router.patch("/sessions/{session_id}", operation_id="state_update_session")
def update_session(session_id: str, payload: SessionUpdate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.update_session(session_id, payload)


@router.get("/users/{user_id}/sessions", operation_id="state_list_sessions")
def list_sessions(
    user_id: str,
    session_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_sessions(user_id, session_status, limit)


@router.post("/turns", status_code=status.HTTP_201_CREATED, operation_id="state_write_turn")
def write_turn(payload: TurnCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.write_turn(payload)


@router.get("/sessions/{session_id}/turns", operation_id="state_list_turns")
def list_turns(
    session_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    newest_first: bool = Query(default=False),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_turns(session_id, limit, newest_first)


@router.post("/attempts", status_code=status.HTTP_201_CREATED, operation_id="state_write_attempt_result")
def write_attempt(payload: AttemptCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.write_attempt(payload)


@router.get("/attempts/{attempt_id}", operation_id="state_get_attempt")
def get_attempt(attempt_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_attempt(attempt_id)


@router.patch("/attempts/{attempt_id}/grading", operation_id="state_check_attempt")
def check_attempt(attempt_id: str, payload: AttemptCheck, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.check_attempt(attempt_id, payload)


@router.get("/users/{user_id}/attempts", operation_id="state_list_attempts")
def list_attempts(
    user_id: str,
    question_id: str | None = Query(default=None),
    is_correct: bool | None = Query(default=None),
    tag_type: str | None = Query(default=None),
    tag_name: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_attempts(
        user_id,
        question_id=question_id,
        is_correct=is_correct,
        tag_type=tag_type,
        tag_name=tag_name,
        limit=limit,
    )


@router.post("/attempts/{attempt_id}/tags", operation_id="state_attach_attempt_tags")
def attach_attempt_tags(attempt_id: str, payload: AttemptTagsAttach, service: StateService = Depends(get_state_service)) -> list[dict[str, Any]]:
    return service.attach_attempt_tags(attempt_id, payload)


@router.post("/attempts/{attempt_id}/apply-state", operation_id="state_update_mastery_from_attempt")
def apply_attempt_state(attempt_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.apply_attempt_state(attempt_id)


@router.post("/reviews", status_code=status.HTTP_201_CREATED, operation_id="state_write_review_event")
def write_review_event(payload: ReviewEventCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.write_review_event(payload)


@router.get("/reviews/{review_event_id}", operation_id="state_get_review_event")
def get_review_event(review_event_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_review_event(review_event_id)


@router.put("/context-summary", operation_id="state_update_context_summary")
def write_context_summary(payload: ContextSummaryWrite, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.write_context_summary(payload)


@router.get("/users/{user_id}/context-summaries", operation_id="state_list_context_summaries")
def list_context_summaries(
    user_id: str,
    session_id: str | None = Query(default=None),
    summary_scope: str | None = Query(default=None),
    summary_status: str | None = Query(default="active", alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_context_summaries(
        user_id,
        session_id=session_id,
        summary_scope=summary_scope,
        status=summary_status,
        limit=limit,
    )


@router.get("/users/{user_id}/sessions/{session_id}/compression-status", operation_id="state_context_compression_status")
def context_compression_status(user_id: str, session_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.context_compression_status(user_id, session_id)


@router.post("/memories", status_code=status.HTTP_201_CREATED, operation_id="state_write_agent_memory")
def write_memory(payload: MemoryCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.write_memory(payload)


@router.get("/memories/{memory_id}", operation_id="state_get_agent_memory")
def get_memory(memory_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_memory(memory_id)


@router.patch("/memories/{memory_id}", operation_id="state_update_agent_memory")
def update_memory(memory_id: str, payload: MemoryUpdate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.update_memory(memory_id, payload)


@router.get("/users/{user_id}/memories", operation_id="state_list_agent_memories")
def list_memories(
    user_id: str,
    memory_type: str | None = Query(default=None),
    memory_status: str | None = Query(default="active", alias="status"),
    include_expired: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_memories(
        user_id,
        memory_type=memory_type,
        status=memory_status,
        include_expired=include_expired,
        limit=limit,
    )


@router.put("/active-context", operation_id="state_upsert_active_context")
def upsert_active_context(payload: ActiveContextUpsert, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.upsert_active_context(payload)


@router.patch("/active-context/{context_id}", operation_id="state_update_active_context_status")
def update_active_context_status(context_id: str, payload: ActiveContextStatusUpdate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.update_active_context_status(context_id, payload)


@router.get("/users/{user_id}/active-context", operation_id="state_list_active_context")
def list_active_context(
    user_id: str,
    session_id: str | None = Query(default=None),
    context_status: str | None = Query(default="active", alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_active_context(
        user_id, session_id=session_id, status=context_status, limit=limit
    )


@router.post("/deltas", status_code=status.HTTP_201_CREATED, operation_id="state_create_pending_delta")
def create_pending_delta(payload: PendingDeltaCreate, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.create_pending_delta(payload)


@router.get("/deltas/{delta_id}", operation_id="state_get_pending_delta")
def get_pending_delta(delta_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_pending_delta(delta_id)


@router.post("/deltas/{delta_id}/validate-and-apply", operation_id="state_validate_and_apply_delta")
def validate_and_apply_delta(delta_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.validate_and_apply_delta(delta_id)


@router.get("/users/{user_id}/deltas", operation_id="state_list_pending_deltas")
def list_pending_deltas(
    user_id: str,
    validation_status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.list_pending_deltas(user_id, validation_status, limit)


@router.get("/users/{user_id}/recent-learning", operation_id="state_query_recent_learning")
def query_recent_learning(user_id: str, limit: int = Query(default=10, ge=1, le=100), service: StateService = Depends(get_state_service)) -> list[dict[str, Any]]:
    return service.query_recent_learning(user_id, limit)


@router.get("/users/{user_id}/wrong-questions", operation_id="state_query_wrong_questions")
def query_wrong_questions(
    user_id: str,
    tag_type: str | None = Query(default=None),
    tag_name: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.query_wrong_questions(user_id, tag_type, tag_name, limit)


@router.get("/users/{user_id}/review-history", operation_id="state_query_review_history")
def query_review_history(user_id: str, limit: int = Query(default=20, ge=1, le=100), service: StateService = Depends(get_state_service)) -> list[dict[str, Any]]:
    return service.query_review_history(user_id, limit)


@router.get("/users/{user_id}/mastery", operation_id="state_query_mastery")
def query_mastery(
    user_id: str,
    entity_type: str | None = Query(default=None),
    state_label: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.query_mastery(user_id, entity_type=entity_type, state_label=state_label, limit=limit)


@router.get("/users/{user_id}/weak-items", operation_id="state_query_weak_items")
def query_weak_items(user_id: str, entity_type: str | None = Query(default=None), limit: int = Query(default=10, ge=1, le=100), service: StateService = Depends(get_state_service)) -> list[dict[str, Any]]:
    return service.query_weak_items(user_id, entity_type, limit)


@router.get("/users/{user_id}/mastery/detail", operation_id="state_get_mastery_detail")
def get_mastery_detail(
    user_id: str,
    entity_type: str = Query(),
    entity_name: str = Query(),
    history_limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> dict[str, Any]:
    return service.get_mastery_detail(user_id, entity_type, entity_name, history_limit)


@router.get("/users/{user_id}/mastery/history", operation_id="state_query_mastery_history")
def query_mastery_history(
    user_id: str,
    entity_type: str | None = Query(default=None),
    entity_name: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.query_mastery_history(user_id, entity_type=entity_type, entity_name=entity_name, limit=limit)


@router.get("/users/{user_id}/mastery/replay", operation_id="state_replay_mastery_history")
def replay_mastery_history(
    user_id: str,
    entity_type: str = Query(),
    entity_name: str = Query(),
    service: StateService = Depends(get_state_service),
) -> dict[str, Any]:
    return service.replay_mastery(user_id, entity_type, entity_name)


@router.get("/users/{user_id}/mastery/explain", operation_id="state_explain_mastery")
def explain_mastery(user_id: str, entity_type: str = Query(), entity_name: str = Query(), service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.explain_mastery(user_id, entity_type, entity_name)


@router.get("/users/{user_id}/error-patterns", operation_id="state_query_error_patterns")
def query_error_patterns(
    user_id: str,
    pattern_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.query_error_patterns(user_id, status=pattern_status, limit=limit)


@router.get("/users/{user_id}/review-schedules", operation_id="state_query_review_schedules")
def query_review_schedules(
    user_id: str,
    schedule_status: str | None = Query(default=None, alias="status"),
    target_type: str | None = Query(default=None),
    due_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.query_review_schedules(
        user_id,
        status=schedule_status,
        target_type=target_type,
        due_only=due_only,
        limit=limit,
    )


@router.get("/users/{user_id}/due-reviews", operation_id="state_query_review_due_items")
def query_due_reviews(user_id: str, limit: int = Query(default=10, ge=1, le=100), service: StateService = Depends(get_state_service)) -> list[dict[str, Any]]:
    return service.query_due_reviews(user_id, limit)


@router.get("/review-schedules/{schedule_id}/explain", operation_id="state_explain_review_schedule")
def explain_review_schedule(schedule_id: str, service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.explain_review_schedule(schedule_id)


@router.get("/users/{user_id}/events", operation_id="state_query_local_events")
def query_local_events(
    user_id: str,
    event_type: str | None = Query(default=None),
    aggregate_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    service: StateService = Depends(get_state_service),
) -> list[dict[str, Any]]:
    return service.query_local_events(user_id, event_type=event_type, aggregate_type=aggregate_type, limit=limit)


@router.post("/users/{user_id}/mastery/apply-decay", operation_id="state_apply_mastery_decay")
def apply_mastery_decay(
    user_id: str,
    min_inactive_days: int = Query(default=30, ge=1, le=3650),
    as_of: str | None = Query(default=None),
    service: StateService = Depends(get_state_service),
) -> dict[str, Any]:
    return service.apply_mastery_decay(user_id, min_inactive_days=min_inactive_days, as_of=as_of)


@router.get("/users/{user_id}/bootstrap-context", operation_id="state_get_agent_bootstrap_context")
def get_agent_bootstrap_context(
    user_id: str,
    session_id: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    service: StateService = Depends(get_state_service),
) -> dict[str, Any]:
    return service.get_agent_bootstrap_context(user_id, session_id, limit)


@router.get("/users/{user_id}/overview", operation_id="state_get_state_overview")
def get_state_overview(user_id: str, session_id: str | None = Query(default=None), service: StateService = Depends(get_state_service)) -> dict[str, Any]:
    return service.get_state_overview(user_id, session_id)
