-- SQLite learning facts, learning-state snapshots, review scheduling, context,
-- and auditable workflow state. Cross-database PgSQL UUIDs are stored as TEXT.

CREATE TABLE user_profile (
    user_id TEXT PRIMARY KEY,
    display_name TEXT,
    current_subject TEXT,
    current_stage TEXT,
    preference_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE learning_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_type TEXT NOT NULL
        CHECK (session_type IN ('new_question', 'review', 'diagnosis', 'free_chat', 'mixed')),
    subject TEXT,
    topic TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'interrupted', 'failed')),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    summary_text TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE question_attempt (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE SET NULL,
    question_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'pgsql'
        CHECK (source_type IN ('pgsql', 'generated_draft', 'user_input')),
    user_answer_text TEXT,
    is_correct INTEGER CHECK (is_correct IN (0, 1) OR is_correct IS NULL),
    score REAL CHECK (score BETWEEN 0.0 AND 1.0 OR score IS NULL),
    attempt_status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (attempt_status IN ('viewed', 'submitted', 'checked', 'abandoned', 'skipped')),
    time_spent_seconds INTEGER CHECK (time_spent_seconds >= 0 OR time_spent_seconds IS NULL),
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5 OR difficulty_level IS NULL),
    main_error_type TEXT CHECK (
        main_error_type IN (
            'knowledge_gap', 'method_selection_error', 'calculation_error',
            'misunderstanding', 'expression_error', 'careless', 'unknown'
        ) OR main_error_type IS NULL
    ),
    error_detail_text TEXT,
    confidence_self_report REAL
        CHECK (confidence_self_report BETWEEN 0.0 AND 1.0 OR confidence_self_report IS NULL),
    state_applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE conversation_turn (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES learning_session(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content_text TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text'
        CHECK (content_type IN ('text', 'question', 'answer', 'tool_result', 'render_json')),
    token_estimate INTEGER CHECK (token_estimate >= 0 OR token_estimate IS NULL),
    related_question_id TEXT,
    related_attempt_id TEXT REFERENCES question_attempt(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE question_attempt_tag (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES question_attempt(id) ON DELETE CASCADE,
    tag_type TEXT NOT NULL
        CHECK (tag_type IN ('knowledge_point', 'method', 'question_type', 'structure', 'thinking_pattern')),
    tag_id TEXT,
    tag_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'secondary'
        CHECK (role IN ('primary', 'secondary', 'prerequisite', 'hidden', 'alternative')),
    weight REAL NOT NULL DEFAULT 1.0 CHECK (weight > 0.0 AND weight <= 2.0),
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (attempt_id, tag_type, tag_name, role)
);

CREATE TABLE mastery_state (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('knowledge_point', 'method', 'question_type', 'structure', 'thinking_pattern')),
    entity_id TEXT,
    entity_name TEXT NOT NULL,
    mastery_score REAL NOT NULL DEFAULT 0.0 CHECK (mastery_score BETWEEN 0.0 AND 1.0),
    confidence_score REAL NOT NULL DEFAULT 0.0 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    exposure_count INTEGER NOT NULL DEFAULT 0 CHECK (exposure_count >= 0),
    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
    recent_score REAL CHECK (recent_score BETWEEN 0.0 AND 1.0 OR recent_score IS NULL),
    state_label TEXT NOT NULL DEFAULT 'unseen'
        CHECK (state_label IN ('unseen', 'exposed', 'learning', 'weak', 'reviewing', 'stable', 'mastered')),
    last_seen_at TEXT,
    last_success_at TEXT,
    last_failure_at TEXT,
    next_review_at TEXT,
    decay_rate REAL NOT NULL DEFAULT 0.05 CHECK (decay_rate >= 0.0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, entity_type, entity_name)
);

CREATE TABLE error_pattern_state (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    error_type TEXT NOT NULL CHECK (
        error_type IN (
            'knowledge_gap', 'method_selection_error', 'calculation_error',
            'misunderstanding', 'expression_error', 'careless', 'unknown'
        )
    ),
    error_pattern_name TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_name TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 0 CHECK (occurrence_count >= 0),
    severity_score REAL NOT NULL DEFAULT 0.0 CHECK (severity_score BETWEEN 0.0 AND 1.0),
    last_occured_at TEXT,
    resolved_score REAL NOT NULL DEFAULT 0.0 CHECK (resolved_score BETWEEN 0.0 AND 1.0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'improving', 'resolved', 'ignored')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, error_pattern_name, related_entity_name)
);

CREATE TABLE review_schedule (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    target_type TEXT NOT NULL
        CHECK (target_type IN ('question', 'knowledge_point', 'method', 'question_type', 'structure', 'thinking_pattern', 'error_pattern')),
    target_id TEXT,
    target_name TEXT NOT NULL,
    priority_score REAL NOT NULL DEFAULT 0.0 CHECK (priority_score BETWEEN 0.0 AND 1.0),
    due_at TEXT NOT NULL,
    interval_days REAL NOT NULL DEFAULT 1.0 CHECK (interval_days > 0.0),
    ease_factor REAL NOT NULL DEFAULT 2.5 CHECK (ease_factor >= 1.3),
    review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
    last_review_at TEXT,
    last_result TEXT CHECK (last_result IN ('success', 'fail', 'partial', 'skipped') OR last_result IS NULL),
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'due', 'completed', 'suspended', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (user_id, target_type, target_name)
);

CREATE TABLE review_event (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE SET NULL,
    schedule_id TEXT REFERENCES review_schedule(id) ON DELETE SET NULL,
    review_type TEXT NOT NULL CHECK (
        review_type IN (
            'old_question_review', 'same_knowledge_new_question',
            'method_transfer', 'error_pattern_review'
        )
    ),
    target_type TEXT NOT NULL
        CHECK (target_type IN ('question', 'knowledge_point', 'method', 'question_type', 'structure', 'thinking_pattern', 'error_pattern')),
    target_id TEXT,
    target_name TEXT NOT NULL,
    result TEXT CHECK (result IN ('success', 'fail', 'partial', 'skipped') OR result IS NULL),
    score REAL CHECK (score BETWEEN 0.0 AND 1.0 OR score IS NULL),
    user_feedback_text TEXT,
    agent_review_summary TEXT,
    next_review_at TEXT,
    state_applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE mastery_event (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    mastery_state_id TEXT REFERENCES mastery_state(id) ON DELETE SET NULL,
    attempt_id TEXT REFERENCES question_attempt(id) ON DELETE SET NULL,
    review_event_id TEXT REFERENCES review_event(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('knowledge_point', 'method', 'question_type', 'structure', 'thinking_pattern')),
    entity_id TEXT,
    entity_name TEXT NOT NULL,
    old_mastery_score REAL CHECK (old_mastery_score BETWEEN 0.0 AND 1.0 OR old_mastery_score IS NULL),
    new_mastery_score REAL CHECK (new_mastery_score BETWEEN 0.0 AND 1.0 OR new_mastery_score IS NULL),
    old_confidence_score REAL CHECK (old_confidence_score BETWEEN 0.0 AND 1.0 OR old_confidence_score IS NULL),
    new_confidence_score REAL CHECK (new_confidence_score BETWEEN 0.0 AND 1.0 OR new_confidence_score IS NULL),
    old_state_label TEXT,
    new_state_label TEXT,
    delta_reason TEXT NOT NULL CHECK (
        delta_reason IN (
            'correct_answer', 'wrong_answer', 'partial_answer', 'review_success',
            'review_failed', 'review_partial', 'manual_adjust', 'agent_suggestion',
            'decay'
        )
    ),
    evidence_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE context_summary (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE CASCADE,
    summary_scope TEXT NOT NULL
        CHECK (summary_scope IN ('turn', 'session', 'topic', 'profile', 'workflow')),
    summary_text TEXT NOT NULL,
    structured_json TEXT NOT NULL DEFAULT '{}',
    source_turn_start_id TEXT,
    source_turn_end_id TEXT,
    token_estimate INTEGER CHECK (token_estimate >= 0 OR token_estimate IS NULL),
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'superseded', 'deprecated')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workflow_run (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE SET NULL,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled', 'waiting_user')),
    input_json TEXT NOT NULL DEFAULT '{}',
    output_json TEXT NOT NULL DEFAULT '{}',
    current_step TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE tool_call_log (
    id TEXT PRIMARY KEY,
    workflow_run_id TEXT REFERENCES workflow_run(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE SET NULL,
    tool_name TEXT NOT NULL,
    input_json TEXT NOT NULL DEFAULT '{}',
    output_summary_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'timeout', 'skipped')),
    error_message TEXT,
    latency_ms INTEGER CHECK (latency_ms >= 0 OR latency_ms IS NULL),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pending_state_delta (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE SET NULL,
    workflow_run_id TEXT REFERENCES workflow_run(id) ON DELETE SET NULL,
    attempt_id TEXT REFERENCES question_attempt(id) ON DELETE SET NULL,
    review_event_id TEXT REFERENCES review_event(id) ON DELETE SET NULL,
    delta_type TEXT NOT NULL
        CHECK (delta_type IN ('mastery_update', 'error_pattern_update', 'review_schedule_update', 'memory_update')),
    proposed_by TEXT NOT NULL DEFAULT 'agent'
        CHECK (proposed_by IN ('agent', 'rule', 'user', 'system')),
    delta_json TEXT NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (validation_status IN ('pending', 'approved', 'rejected', 'applied')),
    validation_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validated_at TEXT,
    applied_at TEXT
);
