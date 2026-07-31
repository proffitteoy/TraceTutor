-- TraceTutor PostgreSQL migration 006: enforce active quality continuously.
BEGIN;

CREATE TABLE knowledge_point_prerequisite (
    knowledge_point_id uuid NOT NULL REFERENCES knowledge_point(id) ON DELETE CASCADE,
    prerequisite_knowledge_point_id uuid NOT NULL REFERENCES knowledge_point(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (knowledge_point_id, prerequisite_knowledge_point_id),
    CHECK (knowledge_point_id <> prerequisite_knowledge_point_id)
);

INSERT INTO knowledge_point_prerequisite (
    knowledge_point_id, prerequisite_knowledge_point_id
)
SELECT kp.id, prerequisite_id
FROM knowledge_point kp
CROSS JOIN LATERAL unnest(kp.prerequisite_ids) AS prerequisite_id;

ALTER TABLE knowledge_point DROP COLUMN prerequisite_ids;

CREATE OR REPLACE FUNCTION assert_active_question_valid(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    current_status text;
BEGIN
    SELECT status INTO current_status
    FROM public.question_asset
    WHERE id = p_question_id;

    IF current_status IS DISTINCT FROM 'active' THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.answer_asset
        WHERE question_id = p_question_id AND is_primary
    ) THEN
        RAISE EXCEPTION 'active_question_requires_primary_answer';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.solution_asset
        WHERE question_id = p_question_id
          AND is_primary
          AND status IN ('reviewed', 'active')
    ) THEN
        RAISE EXCEPTION 'active_question_requires_primary_solution';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.solution_asset s
        JOIN public.solution_step step ON step.solution_id = s.id
        WHERE s.question_id = p_question_id AND s.is_primary
    ) THEN
        RAISE EXCEPTION 'active_question_requires_solution_steps';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.question_knowledge_point
        WHERE question_id = p_question_id AND role = 'primary'
    ) THEN
        RAISE EXCEPTION 'active_question_requires_primary_knowledge';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.question_method
        WHERE question_id = p_question_id AND role = 'primary'
    ) THEN
        RAISE EXCEPTION 'active_question_requires_primary_method';
    END IF;
    IF (
        SELECT review_status
        FROM public.asset_review_log
        WHERE asset_type = 'question' AND asset_id = p_question_id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    ) IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'active_question_requires_latest_approved_review';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_question_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.status = 'active' AND NEW.status NOT IN ('active', 'deprecated') THEN
        RAISE EXCEPTION 'active_question_can_only_be_deprecated';
    END IF;
    IF OLD.status = 'active' AND (
        OLD.stem IS DISTINCT FROM NEW.stem
        OR OLD.question_type IS DISTINCT FROM NEW.question_type
        OR OLD.difficulty_level IS DISTINCT FROM NEW.difficulty_level
        OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
    ) THEN
        RAISE EXCEPTION 'active_question_content_is_immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_question_transition
BEFORE UPDATE ON question_asset
FOR EACH ROW EXECUTE FUNCTION enforce_question_transition();

CREATE OR REPLACE FUNCTION check_question_from_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM public.assert_active_question_valid(
        COALESCE(NEW.question_id, OLD.question_id)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION check_question_asset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM public.assert_active_question_valid(COALESCE(NEW.id, OLD.id));
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION check_question_from_solution_step()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    candidate_solution_id uuid := COALESCE(NEW.solution_id, OLD.solution_id);
    candidate_question_id uuid;
BEGIN
    SELECT question_id INTO candidate_question_id
    FROM public.solution_asset WHERE id = candidate_solution_id;
    IF candidate_question_id IS NOT NULL THEN
        PERFORM public.assert_active_question_valid(candidate_question_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION check_reviewed_question()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF COALESCE(NEW.asset_type, OLD.asset_type) = 'question' THEN
        PERFORM public.assert_active_question_valid(COALESCE(NEW.asset_id, OLD.asset_id));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER ctr_question_asset_quality
AFTER INSERT OR UPDATE ON question_asset
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_asset();
CREATE CONSTRAINT TRIGGER ctr_answer_asset_quality
AFTER INSERT OR UPDATE OR DELETE ON answer_asset
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_from_row();
CREATE CONSTRAINT TRIGGER ctr_solution_asset_quality
AFTER INSERT OR UPDATE OR DELETE ON solution_asset
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_from_row();
CREATE CONSTRAINT TRIGGER ctr_solution_step_quality
AFTER INSERT OR UPDATE OR DELETE ON solution_step
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_from_solution_step();
CREATE CONSTRAINT TRIGGER ctr_question_knowledge_quality
AFTER INSERT OR UPDATE OR DELETE ON question_knowledge_point
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_from_row();
CREATE CONSTRAINT TRIGGER ctr_question_method_quality
AFTER INSERT OR UPDATE OR DELETE ON question_method
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_from_row();
CREATE CONSTRAINT TRIGGER ctr_review_quality
AFTER INSERT OR UPDATE OR DELETE ON asset_review_log
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_reviewed_question();

COMMIT;
