-- Cross-table user ownership and target-consistency checks. These protect the
-- database even if an API implementation mistake bypasses service validation.

CREATE TRIGGER trg_attempt_session_owner_insert
BEFORE INSERT ON question_attempt
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_attempt_session_owner_update
BEFORE UPDATE OF session_id, user_id ON question_attempt
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;

CREATE TRIGGER trg_turn_session_owner_insert
BEFORE INSERT ON conversation_turn
WHEN NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_turn_attempt_owner_insert
BEFORE INSERT ON conversation_turn
WHEN NEW.related_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM question_attempt a WHERE a.id = NEW.related_attempt_id AND a.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'attempt_user_mismatch'); END;

CREATE TRIGGER trg_review_session_owner_insert
BEFORE INSERT ON review_event
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_review_schedule_owner_insert
BEFORE INSERT ON review_event
WHEN NEW.schedule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_schedule r WHERE r.id = NEW.schedule_id AND r.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'review_schedule_user_mismatch'); END;
CREATE TRIGGER trg_review_schedule_target_insert
BEFORE INSERT ON review_event
WHEN NEW.schedule_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM review_schedule r
    WHERE r.id = NEW.schedule_id
      AND (
        r.target_type <> NEW.target_type OR r.target_name <> NEW.target_name OR
        (r.target_id IS NOT NULL AND NEW.target_id IS NOT NULL AND r.target_id <> NEW.target_id)
      )
)
BEGIN SELECT RAISE(ABORT, 'review_schedule_target_mismatch'); END;

CREATE TRIGGER trg_context_session_owner_insert
BEFORE INSERT ON context_summary
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_active_context_session_owner_insert
BEFORE INSERT ON active_context_ref
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_runtime_session_owner_insert
BEFORE INSERT ON agent_runtime_state
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_workflow_session_owner_insert
BEFORE INSERT ON workflow_run
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_tool_session_owner_insert
BEFORE INSERT ON tool_call_log
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_tool_workflow_owner_insert
BEFORE INSERT ON tool_call_log
WHEN NEW.workflow_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workflow_run w WHERE w.id = NEW.workflow_run_id AND w.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'workflow_user_mismatch'); END;

CREATE TRIGGER trg_delta_session_owner_insert
BEFORE INSERT ON pending_state_delta
WHEN NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_session s WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'session_user_mismatch'); END;
CREATE TRIGGER trg_delta_attempt_owner_insert
BEFORE INSERT ON pending_state_delta
WHEN NEW.attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM question_attempt a WHERE a.id = NEW.attempt_id AND a.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'attempt_user_mismatch'); END;
CREATE TRIGGER trg_delta_review_owner_insert
BEFORE INSERT ON pending_state_delta
WHEN NEW.review_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_event r WHERE r.id = NEW.review_event_id AND r.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'review_user_mismatch'); END;
CREATE TRIGGER trg_delta_workflow_owner_insert
BEFORE INSERT ON pending_state_delta
WHEN NEW.workflow_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workflow_run w WHERE w.id = NEW.workflow_run_id AND w.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'workflow_user_mismatch'); END;

CREATE TRIGGER trg_mastery_event_state_owner_insert
BEFORE INSERT ON mastery_event
WHEN NEW.mastery_state_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mastery_state m WHERE m.id = NEW.mastery_state_id AND m.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'mastery_user_mismatch'); END;
CREATE TRIGGER trg_mastery_event_attempt_owner_insert
BEFORE INSERT ON mastery_event
WHEN NEW.attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM question_attempt a WHERE a.id = NEW.attempt_id AND a.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'attempt_user_mismatch'); END;
CREATE TRIGGER trg_mastery_event_review_owner_insert
BEFORE INSERT ON mastery_event
WHEN NEW.review_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_event r WHERE r.id = NEW.review_event_id AND r.user_id = NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'review_user_mismatch'); END;
