-- TraceTutor PostgreSQL migration 003: ingestion, review, and advanced assets.
BEGIN;

CREATE TABLE question_structure_feature (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    structure_code text NOT NULL,
    input_objects jsonb NOT NULL DEFAULT '[]'::jsonb,
    target_objects jsonb NOT NULL DEFAULT '[]'::jsonb,
    constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
    symbolic_form text,
    complexity_score numeric(5,2) CHECK (
        complexity_score IS NULL OR complexity_score >= 0
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (question_id, structure_code)
);

CREATE TABLE question_embedding (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    embedding_model text NOT NULL,
    embedding_type text NOT NULL DEFAULT 'stem'
        CHECK (embedding_type IN ('stem', 'solution', 'full', 'structure')),
    embedding double precision[],
    dimension integer CHECK (dimension IS NULL OR dimension > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (question_id, embedding_model, embedding_type),
    CHECK (
        embedding IS NULL
        OR dimension IS NULL
        OR cardinality(embedding) = dimension
    )
);

CREATE TABLE question_variant_edge (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_question_id uuid NOT NULL
        REFERENCES question_asset(id) ON DELETE CASCADE,
    variant_question_id uuid NOT NULL
        REFERENCES question_asset(id) ON DELETE CASCADE,
    variant_type text NOT NULL CHECK (
        variant_type IN (
            'same_knowledge', 'changed_method', 'changed_condition',
            'increased_difficulty', 'decreased_difficulty', 'transfer'
        )
    ),
    change_description text,
    generated_by text CHECK (
        generated_by IN ('human', 'llm', 'template') OR generated_by IS NULL
    ),
    quality_status text NOT NULL DEFAULT 'pending'
        CHECK (quality_status IN ('pending', 'reviewed', 'active', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (base_question_id <> variant_question_id),
    UNIQUE (base_question_id, variant_question_id, variant_type)
);

CREATE TABLE asset_review_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type text NOT NULL CHECK (
        asset_type IN (
            'question', 'solution', 'answer',
            'knowledge_mapping', 'method_mapping', 'similarity_edge'
        )
    ),
    asset_id uuid NOT NULL,
    review_status text NOT NULL
        CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_fix')),
    reviewer text,
    review_note text,
    score numeric(4,2) CHECK (score IS NULL OR score BETWEEN 0 AND 10),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE import_batch (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_key text NOT NULL UNIQUE,
    batch_name text NOT NULL,
    source_type text NOT NULL
        CHECK (source_type IN ('jsonl', 'manual')),
    source_uri text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    total_count integer NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
    failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CHECK (success_count + failed_count <= total_count)
);

CREATE TABLE staging_question_raw (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid REFERENCES import_batch(id) ON DELETE CASCADE,
    line_number integer NOT NULL CHECK (line_number > 0),
    raw_text text NOT NULL,
    raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    parse_status text NOT NULL DEFAULT 'pending'
        CHECK (
            parse_status IN ('pending', 'parsed', 'failed', 'duplicate', 'rejected')
        ),
    error_message text,
    canonical_hash text,
    created_question_id uuid REFERENCES question_asset(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (batch_id, line_number)
);

COMMIT;
