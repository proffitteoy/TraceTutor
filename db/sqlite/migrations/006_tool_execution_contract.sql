-- TraceTutor ToolExecutionPort idempotency keys.
--
-- Writes arrive through apps/api and may be retried after a timeout. The
-- client event ID is therefore part of the persisted contract rather than a
-- best-effort in-memory deduplication key.

ALTER TABLE question_attempt ADD COLUMN client_event_id TEXT;
CREATE UNIQUE INDEX uq_attempt_client_event
    ON question_attempt(user_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

ALTER TABLE review_event ADD COLUMN client_event_id TEXT;
CREATE UNIQUE INDEX uq_review_client_event
    ON review_event(user_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

ALTER TABLE pending_state_delta ADD COLUMN apply_client_event_id TEXT;
CREATE UNIQUE INDEX uq_delta_apply_client_event
    ON pending_state_delta(user_id, apply_client_event_id)
    WHERE apply_client_event_id IS NOT NULL;
