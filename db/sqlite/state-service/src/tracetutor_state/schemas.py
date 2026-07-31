from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


EntityType = Literal[
    "knowledge_point",
    "method",
    "question_type",
    "structure",
    "thinking_pattern",
]
ReviewTargetType = Literal[
    "question",
    "knowledge_point",
    "method",
    "question_type",
    "structure",
    "thinking_pattern",
    "error_pattern",
]
AttemptResult = Literal["success", "fail", "partial", "skipped"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserCreate(StrictModel):
    user_id: str | None = None
    display_name: str | None = None
    current_subject: str | None = None
    current_stage: str | None = None
    preferences: dict[str, Any] = Field(default_factory=dict)


class UserUpdate(StrictModel):
    display_name: str | None = None
    current_subject: str | None = None
    current_stage: str | None = None
    preferences: dict[str, Any] | None = None


class SessionCreate(StrictModel):
    session_id: str | None = None
    user_id: str
    session_type: Literal["new_question", "review", "diagnosis", "free_chat", "mixed"]
    subject: str | None = None
    topic: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionUpdate(StrictModel):
    status: Literal["active", "completed", "interrupted", "failed"] | None = None
    summary_text: str | None = None
    subject: str | None = None
    topic: str | None = None
    metadata: dict[str, Any] | None = None


class TurnCreate(StrictModel):
    turn_id: str | None = None
    session_id: str
    user_id: str
    role: Literal["user", "assistant", "tool", "system"]
    content_text: str
    content_type: Literal["text", "question", "answer", "tool_result", "render_json"] = "text"
    token_estimate: int | None = Field(default=None, ge=0)
    related_question_id: str | None = None
    related_attempt_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AttemptCreate(StrictModel):
    attempt_id: str | None = None
    user_id: str
    session_id: str | None = None
    question_id: str = Field(min_length=1)
    source_type: Literal["pgsql", "generated_draft", "user_input"] = "pgsql"
    user_answer_text: str | None = None
    is_correct: bool | None = None
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    attempt_status: Literal["viewed", "submitted", "checked", "abandoned", "skipped"] = "submitted"
    time_spent_seconds: int | None = Field(default=None, ge=0)
    difficulty_level: int | None = Field(default=None, ge=1, le=5)
    main_error_type: Literal[
        "knowledge_gap",
        "method_selection_error",
        "calculation_error",
        "misunderstanding",
        "expression_error",
        "careless",
        "unknown",
    ] | None = None
    error_detail_text: str | None = None
    confidence_self_report: float | None = Field(default=None, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize_checked_attempt(self) -> "AttemptCreate":
        if self.is_correct is not None and self.attempt_status in {"viewed", "submitted"}:
            self.attempt_status = "checked"
        return self


class AttemptCheck(StrictModel):
    user_answer_text: str | None = None
    is_correct: bool | None = None
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    attempt_status: Literal["viewed", "submitted", "checked", "abandoned", "skipped"] | None = None
    time_spent_seconds: int | None = Field(default=None, ge=0)
    difficulty_level: int | None = Field(default=None, ge=1, le=5)
    main_error_type: Literal[
        "knowledge_gap",
        "method_selection_error",
        "calculation_error",
        "misunderstanding",
        "expression_error",
        "careless",
        "unknown",
    ] | None = None
    error_detail_text: str | None = None
    confidence_self_report: float | None = Field(default=None, ge=0.0, le=1.0)
    metadata: dict[str, Any] | None = None


class AttemptTag(StrictModel):
    tag_type: EntityType
    tag_id: str | None = None
    tag_name: str = Field(min_length=1)
    role: Literal["primary", "secondary", "prerequisite", "hidden", "alternative"] = "secondary"
    # None means “use the deterministic PDF default for this tag type / role”.
    weight: float | None = Field(default=None, gt=0.0, le=2.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class AttemptTagsAttach(StrictModel):
    tags: list[AttemptTag] = Field(min_length=1)


class ContextSummaryWrite(StrictModel):
    summary_id: str | None = None
    user_id: str
    session_id: str | None = None
    summary_scope: Literal["turn", "session", "topic", "profile", "workflow"]
    summary_text: str
    structured: dict[str, Any] = Field(default_factory=dict)
    source_turn_start_id: str | None = None
    source_turn_end_id: str | None = None
    token_estimate: int | None = Field(default=None, ge=0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class MemoryCreate(StrictModel):
    memory_id: str | None = None
    user_id: str
    memory_type: Literal[
        "short_term",
        "working",
        "learning_preference",
        "open_loop",
        "warning",
        "strategy",
    ]
    title: str
    content_text: str
    related_entity_type: str | None = None
    related_entity_id: str | None = None
    related_entity_name: str | None = None
    importance_score: float = Field(default=0.5, ge=0.0, le=1.0)
    freshness_score: float = Field(default=1.0, ge=0.0, le=1.0)
    expires_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryUpdate(StrictModel):
    status: Literal["active", "resolved", "expired", "deprecated"] | None = None
    content_text: str | None = None
    importance_score: float | None = Field(default=None, ge=0.0, le=1.0)
    freshness_score: float | None = Field(default=None, ge=0.0, le=1.0)
    expires_at: str | None = None
    metadata: dict[str, Any] | None = None


class ActiveContextUpsert(StrictModel):
    ref_id_local: str | None = None
    user_id: str
    session_id: str | None = None
    ref_type: Literal[
        "active_question",
        "active_attempt",
        "active_workflow",
        "active_topic",
        "active_review",
    ]
    ref_id: str
    ref_name: str | None = None
    status: Literal["active", "resolved", "abandoned"] = "active"


class ActiveContextStatusUpdate(StrictModel):
    status: Literal["active", "resolved", "abandoned"]


class ReviewEventCreate(StrictModel):
    review_event_id: str | None = None
    user_id: str
    session_id: str | None = None
    schedule_id: str | None = None
    review_type: Literal[
        "old_question_review",
        "same_knowledge_new_question",
        "method_transfer",
        "error_pattern_review",
    ]
    target_type: ReviewTargetType
    target_id: str | None = None
    target_name: str
    result: AttemptResult
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    user_feedback_text: str | None = None
    agent_review_summary: str | None = None
    # For a question-level review, the caller can send the PgSQL tag snapshot so
    # deterministic mastery updates still have structured evidence.
    evidence_tags: list[AttemptTag] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PendingDeltaCreate(StrictModel):
    delta_id: str | None = None
    user_id: str
    session_id: str | None = None
    workflow_run_id: str | None = None
    attempt_id: str | None = None
    review_event_id: str | None = None
    delta_type: Literal[
        "mastery_update",
        "error_pattern_update",
        "review_schedule_update",
        "memory_update",
    ]
    proposed_by: Literal["agent", "rule", "user", "system"] = "agent"
    delta: dict[str, Any]


class WorkflowCreate(StrictModel):
    run_id: str | None = None
    user_id: str
    session_id: str | None = None
    workflow_name: str
    input: dict[str, Any] = Field(default_factory=dict)
    current_step: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowUpdate(StrictModel):
    status: Literal["running", "succeeded", "failed", "cancelled", "waiting_user"] | None = None
    output: dict[str, Any] | None = None
    current_step: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] | None = None


class ToolCallCreate(StrictModel):
    tool_call_id: str | None = None
    workflow_run_id: str | None = None
    user_id: str
    session_id: str | None = None
    tool_name: str
    input: dict[str, Any] = Field(default_factory=dict)
    output_summary: dict[str, Any] = Field(default_factory=dict)
    status: Literal["succeeded", "failed", "timeout", "skipped"]
    error_message: str | None = None
    latency_ms: int | None = Field(default=None, ge=0)


class RuntimeStateUpsert(StrictModel):
    runtime_id: str | None = None
    user_id: str
    session_id: str | None = None
    agent_name: str
    state_key: str
    state_value: dict[str, Any]
    status: Literal["active", "superseded", "cleared"] = "active"


class RuntimeStateStatusUpdate(StrictModel):
    status: Literal["active", "superseded", "cleared"]


class ConfigUpsert(StrictModel):
    key: str = Field(min_length=1)
    value: Any
    scope: Literal["global", "user", "session"] = "global"
    owner_id: str | None = None

    @model_validator(mode="after")
    def validate_owner(self) -> "ConfigUpsert":
        if self.scope == "global" and self.owner_id is not None:
            raise ValueError("owner_id must be omitted for global config")
        if self.scope != "global" and not self.owner_id:
            raise ValueError("owner_id is required for user/session config")
        return self


class LocalEventCreate(StrictModel):
    event_id: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    event_type: str
    aggregate_type: str | None = None
    aggregate_id: str | None = None
    event: dict[str, Any] = Field(default_factory=dict)
