from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, model_validator

from tracetutor_state.schemas import StrictModel

ToolName = Literal[
    "state.query_user_snapshot",
    "state.query_wrong_questions",
    "state.query_review_due_items",
    "state.write_attempt_result",
    "state.write_review_result",
    "state.apply_state_delta",
    "log.write_agent_event",
]


class ToolRequestContext(StrictModel):
    request_id: str = Field(min_length=1, max_length=128)
    user_id: str = Field(min_length=1, max_length=128)
    session_id: str = Field(min_length=1, max_length=128)


class ToolExecutionRequest(StrictModel):
    tool: ToolName
    input: dict[str, Any]
    context: ToolRequestContext


class ScopedToolInput(StrictModel):
    user_id: str = Field(min_length=1, max_length=128)
    session_id: str = Field(min_length=1, max_length=128)


class QueryUserSnapshotInput(ScopedToolInput):
    pass


class QueryWrongQuestionsInput(ScopedToolInput):
    knowledge_area: str | None = Field(default=None, min_length=1, max_length=128)
    knowledge_point_ids: list[str] = Field(default_factory=list, max_length=20)
    state_labels: list[
        Literal["attempted", "understood", "weak", "reviewing", "stable"]
    ] = Field(default_factory=lambda: ["weak", "reviewing"], max_length=5)
    recent_only: bool = False
    limit: int = Field(default=5, ge=1, le=20)


class QueryReviewDueItemsInput(ScopedToolInput):
    due_before: str | None = None
    target_types: list[
        Literal["question", "knowledge_point", "method", "error_pattern"]
    ] = Field(
        default_factory=lambda: [
            "question",
            "knowledge_point",
            "method",
            "error_pattern",
        ],
        max_length=4,
    )
    limit: int = Field(default=5, ge=1, le=20)


class WriteAttemptResultInput(ScopedToolInput):
    question_id: str = Field(min_length=1, max_length=128)
    answer_text: str = Field(max_length=20_000)
    judgement: Literal["correct", "incorrect", "partial", "ungraded"]
    knowledge_point_ids: list[str] = Field(default_factory=list, max_length=20)
    method_ids: list[str] = Field(default_factory=list, max_length=20)
    client_event_id: str = Field(min_length=1, max_length=128)


class WriteReviewResultInput(ScopedToolInput):
    schedule_id: str = Field(min_length=1, max_length=128)
    question_id: str = Field(min_length=1, max_length=128)
    attempt_id: str = Field(min_length=1, max_length=128)
    outcome: Literal["remembered", "partial", "forgotten"]
    client_event_id: str = Field(min_length=1, max_length=128)


class StateDeltaEvidence(StrictModel):
    question_id: str = Field(min_length=1, max_length=128)
    attempt_id: str | None = Field(default=None, min_length=1, max_length=128)
    review_event_id: str | None = Field(
        default=None, min_length=1, max_length=128
    )
    judgement: Literal["correct", "incorrect", "partial", "ungraded"]
    knowledge_point_ids: list[str] = Field(default_factory=list)
    method_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_fact(self) -> "StateDeltaEvidence":
        if self.attempt_id is None and self.review_event_id is None:
            raise ValueError("attempt_id or review_event_id is required")
        return self


class StateDelta(StrictModel):
    target_type: Literal[
        "knowledge_mastery",
        "method_mastery",
        "error_pattern",
        "review_schedule",
        "context_summary",
    ]
    target_id: str = Field(min_length=1, max_length=128)
    proposed_change: float | None = Field(default=None, ge=-1.0, le=1.0)
    proposed_status: Literal[
        "attempted", "understood", "weak", "reviewing", "stable"
    ] | None = None
    reason: str = Field(min_length=1, max_length=1_000)
    evidence: StateDeltaEvidence

    @model_validator(mode="after")
    def require_change(self) -> "StateDelta":
        if self.proposed_change is None and self.proposed_status is None:
            raise ValueError("proposed_change or proposed_status is required")
        if (
            self.target_type == "knowledge_mastery"
            and self.target_id not in self.evidence.knowledge_point_ids
        ):
            raise ValueError("knowledge target must be present in evidence")
        if (
            self.target_type == "method_mastery"
            and self.target_id not in self.evidence.method_ids
        ):
            raise ValueError("method target must be present in evidence")
        return self


class ApplyStateDeltaInput(ScopedToolInput):
    pending_state_delta_id: str = Field(min_length=1, max_length=128)
    state_delta: StateDelta
    client_event_id: str = Field(min_length=1, max_length=128)


class AgentEventReferences(StrictModel):
    question_ids: list[str] = Field(default_factory=list, max_length=100)
    attempt_ids: list[str] = Field(default_factory=list, max_length=100)


class WriteAgentEventInput(ScopedToolInput):
    workflow_run_id: str = Field(min_length=1, max_length=128)
    event_type: Literal[
        "intent_detected",
        "plan_validated",
        "tool_called",
        "tool_failed",
        "output_ready",
        "state_write_rejected",
    ]
    summary: str = Field(min_length=1, max_length=4_000)
    references: AgentEventReferences = Field(default_factory=AgentEventReferences)


TOOL_INPUT_MODELS = {
    "state.query_user_snapshot": QueryUserSnapshotInput,
    "state.query_wrong_questions": QueryWrongQuestionsInput,
    "state.query_review_due_items": QueryReviewDueItemsInput,
    "state.write_attempt_result": WriteAttemptResultInput,
    "state.write_review_result": WriteReviewResultInput,
    "state.apply_state_delta": ApplyStateDeltaInput,
    "log.write_agent_event": WriteAgentEventInput,
}
