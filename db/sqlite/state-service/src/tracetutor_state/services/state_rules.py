from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping


def clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def sqlite_timestamp(value: datetime | None = None) -> str:
    value = value or utc_now()
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def parse_sqlite_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        return parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return None


DEFAULT_TAG_WEIGHT_MATRIX: dict[str, dict[str, float]] = {
    "knowledge_point": {
        "primary": 1.0,
        "secondary": 0.5,
        "prerequisite": 0.4,
        "hidden": 0.7,
        "alternative": 0.5,
    },
    "method": {
        "primary": 1.0,
        "secondary": 0.6,
        "prerequisite": 0.5,
        "hidden": 0.7,
        "alternative": 0.6,
    },
    "question_type": {
        "primary": 0.6,
        "secondary": 0.5,
        "prerequisite": 0.4,
        "hidden": 0.5,
        "alternative": 0.5,
    },
    "structure": {
        "primary": 0.6,
        "secondary": 0.5,
        "prerequisite": 0.4,
        "hidden": 0.5,
        "alternative": 0.5,
    },
    "thinking_pattern": {
        "primary": 0.9,
        "secondary": 0.8,
        "prerequisite": 0.7,
        "hidden": 0.9,
        "alternative": 0.7,
    },
}


@dataclass(frozen=True, slots=True)
class RuleConfig:
    alpha: float = 0.12
    beta: float = 0.18
    partial_pull: float = 0.03
    initial_mastery_prior: float = 0.50
    initial_confidence_prior: float = 0.10
    confidence_gain: float = 0.10
    recent_previous_weight: float = 0.70
    stable_confidence_threshold: float = 0.55
    mastered_score_threshold: float = 0.80
    mastered_confidence_threshold: float = 0.70
    mastered_min_exposures: int = 5
    mastered_min_distinct_questions: int = 5
    mastered_min_distinct_structures: int = 2
    mastered_min_distinct_difficulties: int = 2
    min_ease_factor: float = 1.30
    max_mastery_change_per_event: float = 0.25
    max_confidence_change_per_event: float = 0.20
    max_priority_change_per_event: float = 0.40
    priority_weakness_weight: float = 0.35
    priority_severity_weight: float = 0.25
    priority_due_weight: float = 0.25
    priority_importance_weight: float = 0.15
    error_severity_gain: float = 0.18
    error_resolution_success_gain: float = 0.25
    error_resolution_partial_gain: float = 0.10
    error_resolution_fail_loss: float = 0.15
    tag_weight_matrix: dict[str, dict[str, float]] = field(
        default_factory=lambda: DEFAULT_TAG_WEIGHT_MATRIX.copy()
    )
    state_write_allowed_workflow_statuses: tuple[str, ...] = (
        "running",
        "waiting_user",
        "succeeded",
    )
    state_write_allowed_steps: tuple[str, ...] = (
        "TEACHING_OUTPUT_READY",
        "STATE_DELTA_READY",
        "STATE_WRITTEN",
        "WAITING_USER_ANSWER",
        "RESULTS_COMPRESSED",
        "DONE",
    )

    @classmethod
    def from_mapping(cls, values: Mapping[str, Any]) -> "RuleConfig":
        def num(key: str, default: float) -> float:
            value = values.get(key, default)
            return float(value)

        def integer(key: str, default: int) -> int:
            value = values.get(key, default)
            return int(value)

        matrix = values.get("tag_weight_matrix", DEFAULT_TAG_WEIGHT_MATRIX)
        if not isinstance(matrix, dict):
            matrix = DEFAULT_TAG_WEIGHT_MATRIX
        statuses = values.get(
            "state_write_allowed_workflow_statuses",
            ["running", "waiting_user", "succeeded"],
        )
        steps = values.get(
            "state_write_allowed_steps",
            [
                "TEACHING_OUTPUT_READY",
                "STATE_DELTA_READY",
                "STATE_WRITTEN",
                "WAITING_USER_ANSWER",
                "RESULTS_COMPRESSED",
                "DONE",
            ],
        )
        priority_weights = values.get("review_priority_weights", {})
        if not isinstance(priority_weights, dict):
            priority_weights = {}
        return cls(
            alpha=num("mastery_alpha", 0.12),
            beta=num("mastery_beta", 0.18),
            partial_pull=num("mastery_partial_pull", 0.03),
            initial_mastery_prior=num("mastery_initial_prior", 0.50),
            initial_confidence_prior=num("confidence_initial_prior", 0.10),
            confidence_gain=num("confidence_gain", 0.10),
            recent_previous_weight=num("recent_previous_weight", 0.70),
            stable_confidence_threshold=num("stable_confidence_threshold", 0.55),
            mastered_score_threshold=num("mastered_score_threshold", 0.80),
            mastered_confidence_threshold=num("mastered_confidence_threshold", 0.70),
            mastered_min_exposures=integer("mastered_min_exposures", 5),
            mastered_min_distinct_questions=integer(
                "mastered_min_distinct_questions", 5
            ),
            mastered_min_distinct_structures=integer(
                "mastered_min_distinct_structures", 2
            ),
            mastered_min_distinct_difficulties=integer(
                "mastered_min_distinct_difficulties", 2
            ),
            min_ease_factor=num("review_min_ease_factor", 1.30),
            max_mastery_change_per_event=num("max_mastery_change_per_event", 0.25),
            max_confidence_change_per_event=num(
                "max_confidence_change_per_event", 0.20
            ),
            max_priority_change_per_event=num("max_priority_change_per_event", 0.40),
            priority_weakness_weight=float(priority_weights.get("weakness", 0.35)),
            priority_severity_weight=float(priority_weights.get("severity", 0.25)),
            priority_due_weight=float(priority_weights.get("due", 0.25)),
            priority_importance_weight=float(priority_weights.get("importance", 0.15)),
            error_severity_gain=num("error_severity_gain", 0.18),
            error_resolution_success_gain=num(
                "error_resolution_success_gain", 0.25
            ),
            error_resolution_partial_gain=num(
                "error_resolution_partial_gain", 0.10
            ),
            error_resolution_fail_loss=num("error_resolution_fail_loss", 0.15),
            tag_weight_matrix=matrix,
            state_write_allowed_workflow_statuses=tuple(str(item) for item in statuses),
            state_write_allowed_steps=tuple(str(item) for item in steps),
        )

    def default_tag_weight(self, tag_type: str, role: str) -> float:
        type_weights = self.tag_weight_matrix.get(tag_type, {})
        return float(type_weights.get(role, type_weights.get("secondary", 1.0)))


@dataclass(frozen=True, slots=True)
class DiversityEvidence:
    distinct_questions: int = 0
    distinct_structures: int = 0
    distinct_difficulties: int = 0
    distinct_methods: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "distinct_questions": self.distinct_questions,
            "distinct_structures": self.distinct_structures,
            "distinct_difficulties": self.distinct_difficulties,
            "distinct_methods": self.distinct_methods,
        }


@dataclass(frozen=True, slots=True)
class MasteryTransition:
    mastery_score: float
    confidence_score: float
    recent_score: float
    state_label: str


def classify_state(
    mastery_score: float,
    confidence_score: float,
    exposure_count: int,
    recent_score: float | None,
    diversity: DiversityEvidence,
    config: RuleConfig,
) -> str:
    if exposure_count <= 0:
        return "unseen"
    if mastery_score < 0.20:
        return "exposed"
    if mastery_score < 0.45:
        return "weak"
    if mastery_score < 0.65:
        return "learning"
    if mastery_score < config.mastered_score_threshold:
        if (
            confidence_score >= config.stable_confidence_threshold
            and (recent_score is None or recent_score >= 0.65)
        ):
            return "stable"
        return "reviewing"
    diversity_ok = (
        diversity.distinct_questions >= config.mastered_min_distinct_questions
        and diversity.distinct_structures >= config.mastered_min_distinct_structures
        and diversity.distinct_difficulties
        >= config.mastered_min_distinct_difficulties
    )
    if (
        mastery_score >= config.mastered_score_threshold
        and confidence_score > config.mastered_confidence_threshold
        and exposure_count >= config.mastered_min_exposures
        and diversity_ok
    ):
        return "mastered"
    return "stable"


def update_mastery(
    *,
    old_mastery: float,
    old_confidence: float,
    old_recent_score: float | None,
    exposure_count_after: int,
    result: str,
    weight: float,
    diversity: DiversityEvidence,
    config: RuleConfig,
) -> MasteryTransition:
    effective_weight = clamp(weight)
    if result == "success":
        new_mastery = old_mastery + config.alpha * effective_weight * (1.0 - old_mastery)
        evidence_value = 1.0
    elif result == "fail":
        new_mastery = old_mastery - config.beta * effective_weight * old_mastery
        evidence_value = 0.0
    elif result == "partial":
        new_mastery = old_mastery + config.partial_pull * effective_weight * (
            0.60 - old_mastery
        )
        evidence_value = 0.5
    else:
        new_mastery = old_mastery
        evidence_value = old_recent_score if old_recent_score is not None else 0.5

    new_mastery = clamp(new_mastery)
    evidence_gain = 0.0 if result == "skipped" else config.confidence_gain
    new_confidence = clamp(
        old_confidence + evidence_gain * effective_weight * (1.0 - old_confidence)
    )
    recent = old_recent_score if old_recent_score is not None else 0.5
    previous_weight = clamp(config.recent_previous_weight)
    new_recent = clamp(previous_weight * recent + (1.0 - previous_weight) * evidence_value)
    label = classify_state(
        new_mastery,
        new_confidence,
        exposure_count_after,
        new_recent,
        diversity,
        config,
    )
    return MasteryTransition(
        mastery_score=round(new_mastery, 6),
        confidence_score=round(new_confidence, 6),
        recent_score=round(new_recent, 6),
        state_label=label,
    )


@dataclass(frozen=True, slots=True)
class PriorityResult:
    score: float
    components: dict[str, float]


def calculate_priority(
    *,
    mastery_score: float,
    severity_score: float,
    due_score: float,
    importance_score: float,
    config: RuleConfig,
) -> PriorityResult:
    components = {
        "weakness": round(config.priority_weakness_weight * (1.0 - clamp(mastery_score)), 6),
        "severity": round(config.priority_severity_weight * clamp(severity_score), 6),
        "due": round(config.priority_due_weight * clamp(due_score), 6),
        "importance": round(
            config.priority_importance_weight * clamp(importance_score), 6
        ),
    }
    return PriorityResult(
        score=round(clamp(sum(components.values())), 6),
        components=components,
    )


@dataclass(frozen=True, slots=True)
class ReviewTransition:
    interval_days: float
    ease_factor: float
    due_at: str
    priority_score: float
    priority_components: dict[str, float]
    status: str


def update_review_schedule(
    *,
    old_interval_days: float | None,
    old_ease_factor: float | None,
    result: str,
    mastery_score: float,
    severity_score: float,
    importance_score: float,
    config: RuleConfig,
    now: datetime | None = None,
) -> ReviewTransition:
    now = now or utc_now()
    old_interval = old_interval_days or 1.0
    ease = old_ease_factor or 2.5

    if result == "fail":
        interval = 1.0
        ease = max(config.min_ease_factor, ease - 0.20)
        due_score = 1.0
    elif result == "partial":
        interval = max(1.0, old_interval * 1.30)
        ease = max(config.min_ease_factor, ease - 0.05)
        due_score = 0.70
    elif result == "success":
        interval = max(1.0, old_interval * ease)
        ease = ease + 0.05
        due_score = 0.25
    else:
        interval = max(1.0, old_interval)
        due_score = 0.50

    priority = calculate_priority(
        mastery_score=mastery_score,
        severity_score=severity_score,
        due_score=due_score,
        importance_score=importance_score,
        config=config,
    )
    due_at = sqlite_timestamp(now + timedelta(days=interval))
    return ReviewTransition(
        interval_days=round(interval, 4),
        ease_factor=round(ease, 4),
        due_at=due_at,
        priority_score=priority.score,
        priority_components=priority.components,
        status="scheduled",
    )


@dataclass(frozen=True, slots=True)
class ErrorTransition:
    occurrence_count: int
    severity_score: float
    resolved_score: float
    status: str


def update_error_pattern(
    *,
    old_occurrence_count: int,
    old_severity_score: float,
    old_resolved_score: float,
    result: str,
    config: RuleConfig,
) -> ErrorTransition:
    occurrence = old_occurrence_count
    severity = old_severity_score
    resolved = old_resolved_score

    if result == "fail":
        occurrence += 1
        severity = clamp(severity + config.error_severity_gain * (1.0 - severity))
        resolved = clamp(resolved - config.error_resolution_fail_loss * resolved)
    elif result == "partial":
        resolved = clamp(
            resolved + config.error_resolution_partial_gain * (1.0 - resolved)
        )
        severity = clamp(severity - 0.05 * severity)
    elif result == "success":
        resolved = clamp(
            resolved + config.error_resolution_success_gain * (1.0 - resolved)
        )
        severity = clamp(severity - 0.15 * severity)

    if resolved >= 0.80 and severity <= 0.30:
        status = "resolved"
    elif resolved > 0.20:
        status = "improving"
    else:
        status = "active"
    return ErrorTransition(
        occurrence_count=occurrence,
        severity_score=round(severity, 6),
        resolved_score=round(resolved, 6),
        status=status,
    )
