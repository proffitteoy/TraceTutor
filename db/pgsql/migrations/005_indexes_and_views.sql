-- TraceTutor PostgreSQL migration 005: indexes and application views.
BEGIN;

CREATE UNIQUE INDEX uq_answer_primary
    ON answer_asset(question_id)
    WHERE is_primary;

CREATE UNIQUE INDEX uq_solution_primary
    ON solution_asset(question_id)
    WHERE is_primary;

CREATE INDEX idx_question_subject
    ON question_asset(subject_id);

CREATE INDEX idx_question_type
    ON question_asset(question_type);

CREATE INDEX idx_question_difficulty
    ON question_asset(difficulty_level);

CREATE INDEX idx_question_status
    ON question_asset(status);

CREATE INDEX idx_question_origin_type
    ON question_asset(origin_type);

CREATE INDEX idx_question_stem_trgm
    ON question_asset USING gin (stem gin_trgm_ops);

CREATE INDEX idx_question_metadata
    ON question_asset USING gin (metadata);

CREATE INDEX idx_qkp_knowledge
    ON question_knowledge_point(knowledge_point_id, role, weight DESC);

CREATE INDEX idx_qkp_question
    ON question_knowledge_point(question_id);

CREATE INDEX idx_qm_method
    ON question_method(method_id, role, weight DESC);

CREATE INDEX idx_qm_question
    ON question_method(question_id);

CREATE INDEX idx_structure_code
    ON question_structure_feature(structure_code);

CREATE INDEX idx_similarity_source
    ON question_similarity_edge(source_question_id, similarity_type, score DESC);

CREATE INDEX idx_similarity_target
    ON question_similarity_edge(target_question_id, similarity_type, score DESC);

CREATE INDEX idx_variant_base
    ON question_variant_edge(base_question_id, variant_type);

CREATE INDEX idx_variant_target
    ON question_variant_edge(variant_question_id, variant_type);

CREATE INDEX idx_review_asset
    ON asset_review_log(asset_type, asset_id, review_status, created_at DESC);

CREATE INDEX idx_import_batch_status
    ON import_batch(status, created_at DESC);

CREATE INDEX idx_staging_batch_status
    ON staging_question_raw(batch_id, parse_status);

CREATE INDEX idx_staging_hash
    ON staging_question_raw(canonical_hash);

CREATE VIEW active_question_summary AS
SELECT
    q.id,
    q.title,
    q.stem,
    q.question_type,
    q.difficulty_level,
    q.subject_id,
    q.source_id,
    q.origin_type,
    q.metadata,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', kp.id,
                    'code', kp.code,
                    'name', kp.name,
                    'role', qkp.role,
                    'weight', qkp.weight
                )
                ORDER BY qkp.weight DESC, kp.code
            )
            FROM question_knowledge_point qkp
            JOIN knowledge_point kp
              ON kp.id = qkp.knowledge_point_id
            WHERE qkp.question_id = q.id
        ),
        '[]'::jsonb
    ) AS knowledge_points,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', m.id,
                    'code', m.code,
                    'name', m.name,
                    'role', qm.role,
                    'weight', qm.weight
                )
                ORDER BY qm.weight DESC, m.code
            )
            FROM question_method qm
            JOIN method_asset m
              ON m.id = qm.method_id
            WHERE qm.question_id = q.id
        ),
        '[]'::jsonb
    ) AS methods
FROM question_asset q
WHERE q.status = 'active'
  AND q.is_public;

CREATE VIEW question_review_queue AS
SELECT
    q.id,
    q.title,
    q.question_type,
    q.difficulty_level,
    q.status,
    q.origin_type,
    q.created_at,
    latest.review_status AS latest_review_status,
    latest.review_note AS latest_review_note
FROM question_asset q
LEFT JOIN LATERAL (
    SELECT review_status, review_note
    FROM asset_review_log
    WHERE asset_type = 'question'
      AND asset_id = q.id
    ORDER BY created_at DESC
    LIMIT 1
) latest ON true
WHERE q.status IN ('draft', 'imported', 'reviewed');

COMMIT;
