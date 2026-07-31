-- Recommended indexes plus operational and explainability views.

CREATE INDEX idx_session_user_status
    ON learning_session(user_id, status, started_at DESC);
CREATE INDEX idx_turn_session_time
    ON conversation_turn(session_id, created_at);
CREATE INDEX idx_turn_user_time
    ON conversation_turn(user_id, created_at DESC);
CREATE INDEX idx_attempt_user_question
    ON question_attempt(user_id, question_id, created_at DESC);
CREATE INDEX idx_attempt_user_time
    ON question_attempt(user_id, created_at DESC);
CREATE INDEX idx_attempt_user_result
    ON question_attempt(user_id, is_correct, created_at DESC);
CREATE INDEX idx_attempt_tag_attempt
    ON question_attempt_tag(attempt_id);
CREATE INDEX idx_attempt_tag_type_name
    ON question_attempt_tag(tag_type, tag_name);
CREATE INDEX idx_mastery_user_entity
    ON mastery_state(user_id, entity_type, entity_name);
CREATE INDEX idx_mastery_user_state
    ON mastery_state(user_id, state_label, updated_at DESC);
CREATE INDEX idx_mastery_review_due
    ON mastery_state(user_id, next_review_at);
CREATE INDEX idx_mastery_event_user_entity
    ON mastery_event(user_id, entity_type, entity_name, created_at DESC);
CREATE INDEX idx_mastery_event_attempt
    ON mastery_event(attempt_id, created_at);
CREATE INDEX idx_mastery_event_review
    ON mastery_event(review_event_id, created_at);
CREATE INDEX idx_error_user_status
    ON error_pattern_state(user_id, status, severity_score DESC);
CREATE INDEX idx_review_user_due
    ON review_schedule(user_id, status, due_at, priority_score DESC);
CREATE INDEX idx_review_event_user_time
    ON review_event(user_id, created_at DESC);
CREATE INDEX idx_context_user_scope
    ON context_summary(user_id, summary_scope, status, updated_at DESC);
CREATE INDEX idx_memory_user_active
    ON agent_memory_item(user_id, status, importance_score DESC, updated_at DESC);
CREATE INDEX idx_active_context_session
    ON active_context_ref(user_id, session_id, status, updated_at DESC);
CREATE INDEX idx_runtime_user_session
    ON agent_runtime_state(user_id, session_id, status, updated_at DESC);
CREATE INDEX idx_workflow_user_status
    ON workflow_run(user_id, status, started_at DESC);
CREATE INDEX idx_tool_workflow
    ON tool_call_log(workflow_run_id, created_at);
CREATE INDEX idx_tool_user_time
    ON tool_call_log(user_id, created_at DESC);
CREATE INDEX idx_delta_status
    ON pending_state_delta(user_id, validation_status, created_at);
CREATE INDEX idx_event_user_time
    ON local_event_log(user_id, created_at DESC);

CREATE UNIQUE INDEX uq_active_attempt_delta
    ON pending_state_delta(attempt_id, delta_type)
    WHERE attempt_id IS NOT NULL
      AND validation_status IN ('pending', 'approved', 'applied');
CREATE UNIQUE INDEX uq_active_review_delta
    ON pending_state_delta(review_event_id, delta_type)
    WHERE review_event_id IS NOT NULL
      AND validation_status IN ('pending', 'approved', 'applied');

CREATE VIEW v_due_review AS
SELECT *
FROM review_schedule
WHERE status IN ('scheduled', 'due')
  AND due_at <= CURRENT_TIMESTAMP;

CREATE VIEW v_weak_mastery AS
SELECT *
FROM mastery_state
WHERE state_label IN ('exposed', 'weak', 'learning', 'reviewing');

CREATE VIEW v_attempt_with_session AS
SELECT
    a.*,
    s.session_type,
    s.subject,
    s.topic
FROM question_attempt a
LEFT JOIN learning_session s ON s.id = a.session_id;

CREATE VIEW v_unverified_state_delta AS
SELECT *
FROM pending_state_delta
WHERE validation_status IN ('pending', 'approved');

CREATE VIEW v_recent_learning AS
SELECT
    s.user_id,
    s.id AS session_id,
    s.subject,
    s.topic,
    s.session_type,
    s.status AS session_status,
    s.started_at,
    COUNT(a.id) AS attempt_count,
    SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
    SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count
FROM learning_session s
LEFT JOIN question_attempt a ON a.session_id = s.id
GROUP BY s.id;
