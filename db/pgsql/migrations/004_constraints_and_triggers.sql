-- TraceTutor PostgreSQL migration 004: base constraints and triggers.
BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalized_question_hash(p_stem text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    normalized text;
BEGIN
    normalized := regexp_replace(lower(trim(p_stem)), '[[:space:]]+', '', 'g');
    normalized := translate(normalized, '，。；：？！', ',.;:?!');
    RETURN encode(digest(normalized, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION set_question_canonical_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.canonical_hash := normalized_question_hash(NEW.stem);
    ELSIF NEW.canonical_hash IS NULL
          OR OLD.stem IS DISTINCT FROM NEW.stem THEN
        NEW.canonical_hash := normalized_question_hash(NEW.stem);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_question_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    should_validate boolean := false;
BEGIN
    IF NEW.status = 'active' THEN
        IF TG_OP = 'INSERT' THEN
            should_validate := true;
        ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
            should_validate := true;
        END IF;
    END IF;

    IF should_validate THEN
        IF NOT EXISTS (
            SELECT 1
            FROM answer_asset
            WHERE question_id = NEW.id
              AND is_primary
        ) THEN
            RAISE EXCEPTION 'active_question_requires_primary_answer';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM solution_asset
            WHERE question_id = NEW.id
              AND is_primary
              AND status IN ('reviewed', 'active')
        ) THEN
            RAISE EXCEPTION 'active_question_requires_primary_solution';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM asset_review_log
            WHERE asset_type = 'question'
              AND asset_id = NEW.id
              AND review_status = 'approved'
        ) THEN
            RAISE EXCEPTION 'active_question_requires_approved_review';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_question_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'only_draft_or_rejected_question_can_be_deleted';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_subject_domain_updated_at
BEFORE UPDATE ON subject_domain
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_knowledge_point_updated_at
BEFORE UPDATE ON knowledge_point
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_method_asset_updated_at
BEFORE UPDATE ON method_asset
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_question_asset_updated_at
BEFORE UPDATE ON question_asset
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_question_canonical_hash_insert
BEFORE INSERT ON question_asset
FOR EACH ROW EXECUTE FUNCTION set_question_canonical_hash();

CREATE TRIGGER trg_question_canonical_hash_update
BEFORE UPDATE OF stem ON question_asset
FOR EACH ROW EXECUTE FUNCTION set_question_canonical_hash();

CREATE TRIGGER trg_question_activation
BEFORE INSERT OR UPDATE ON question_asset
FOR EACH ROW EXECUTE FUNCTION validate_question_activation();

CREATE TRIGGER trg_question_delete
BEFORE DELETE ON question_asset
FOR EACH ROW EXECUTE FUNCTION protect_question_delete();

COMMIT;
