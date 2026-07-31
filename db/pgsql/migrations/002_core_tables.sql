-- TraceTutor PostgreSQL migration 002: core question assets.
BEGIN;

CREATE TABLE subject_domain (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES subject_domain(id) ON DELETE SET NULL,
    name text NOT NULL,
    code text NOT NULL UNIQUE,
    level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE source_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type text NOT NULL CHECK (
        source_type IN (
            'textbook', 'exam', 'pdf', 'markdown',
            'ai_generated', 'user_submitted', 'external_import', 'manual'
        )
    ),
    title text,
    author text,
    publisher text,
    year integer,
    file_uri text,
    page_start integer,
    page_end integer,
    external_url text,
    license_note text,
    raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (page_start IS NULL OR page_start > 0),
    CHECK (page_end IS NULL OR page_start IS NULL OR page_end >= page_start)
);

CREATE TABLE knowledge_point (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id uuid REFERENCES subject_domain(id) ON DELETE SET NULL,
    parent_id uuid REFERENCES knowledge_point(id) ON DELETE SET NULL,
    name text NOT NULL,
    code text NOT NULL UNIQUE,
    description text,
    level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
    prerequisite_ids uuid[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE method_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES method_asset(id) ON DELETE SET NULL,
    name text NOT NULL,
    code text NOT NULL UNIQUE,
    description text,
    method_type text CHECK (
        method_type IN (
            'transform', 'theorem_application', 'construction',
            'estimation', 'contradiction', 'induction', 'computation'
        ) OR method_type IS NULL
    ),
    applicable_scene text,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE question_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid REFERENCES source_asset(id) ON DELETE SET NULL,
    subject_id uuid REFERENCES subject_domain(id) ON DELETE SET NULL,
    title text,
    stem text NOT NULL,
    question_type text NOT NULL CHECK (
        question_type IN (
            'single_choice', 'multiple_choice', 'fill_blank',
            'calculation', 'proof', 'programming', 'essay'
        )
    ),
    difficulty_level integer NOT NULL DEFAULT 3
        CHECK (difficulty_level BETWEEN 1 AND 5),
    difficulty_note text,
    language text NOT NULL DEFAULT 'zh',
    status text NOT NULL DEFAULT 'draft' CHECK (
        status IN (
            'draft', 'imported', 'reviewed',
            'active', 'deprecated', 'rejected'
        )
    ),
    origin_type text NOT NULL DEFAULT 'unknown' CHECK (
        origin_type IN (
            'manual', 'user_input', 'ai_generated',
            'external_import', 'user_submitted'
        )
    ),
    is_public boolean NOT NULL DEFAULT true,
    canonical_hash text UNIQUE,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE question_version (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    version_no integer NOT NULL CHECK (version_no > 0),
    stem text NOT NULL,
    change_note text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (question_id, version_no)
);

CREATE TABLE answer_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    answer_text text NOT NULL,
    answer_type text NOT NULL DEFAULT 'standard' CHECK (
        answer_type IN ('standard', 'short', 'option', 'numeric', 'symbolic')
    ),
    is_primary boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE solution_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    title text,
    solution_text text NOT NULL,
    solution_type text NOT NULL DEFAULT 'standard' CHECK (
        solution_type IN (
            'standard', 'alternative', 'concise',
            'detailed', 'teaching', 'review'
        )
    ),
    main_method_id uuid REFERENCES method_asset(id) ON DELETE SET NULL,
    difficulty_level integer CHECK (difficulty_level BETWEEN 1 AND 5),
    is_primary boolean NOT NULL DEFAULT false,
    quality_score numeric(4,2) CHECK (
        quality_score IS NULL OR quality_score BETWEEN 0 AND 10
    ),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'reviewed', 'active', 'deprecated')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE solution_step (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id uuid NOT NULL REFERENCES solution_asset(id) ON DELETE CASCADE,
    step_order integer NOT NULL CHECK (step_order > 0),
    step_title text,
    step_text text NOT NULL,
    step_role text CHECK (
        step_role IN (
            'understand_problem', 'transform', 'apply_method',
            'compute', 'conclude', 'check'
        ) OR step_role IS NULL
    ),
    knowledge_point_id uuid REFERENCES knowledge_point(id) ON DELETE SET NULL,
    method_id uuid REFERENCES method_asset(id) ON DELETE SET NULL,
    formula_text text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (solution_id, step_order)
);

CREATE TABLE question_knowledge_point (
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    knowledge_point_id uuid NOT NULL
        REFERENCES knowledge_point(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'secondary'
        CHECK (role IN ('primary', 'secondary', 'prerequisite', 'hidden')),
    weight numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
    confidence numeric(5,4) NOT NULL DEFAULT 1.0
        CHECK (confidence BETWEEN 0 AND 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, knowledge_point_id, role)
);

CREATE TABLE question_method (
    question_id uuid NOT NULL REFERENCES question_asset(id) ON DELETE CASCADE,
    method_id uuid NOT NULL REFERENCES method_asset(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'secondary'
        CHECK (role IN ('primary', 'secondary', 'alternative', 'hidden')),
    weight numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
    confidence numeric(5,4) NOT NULL DEFAULT 1.0
        CHECK (confidence BETWEEN 0 AND 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, method_id, role)
);

CREATE TABLE question_similarity_edge (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_question_id uuid NOT NULL
        REFERENCES question_asset(id) ON DELETE CASCADE,
    target_question_id uuid NOT NULL
        REFERENCES question_asset(id) ON DELETE CASCADE,
    similarity_type text NOT NULL CHECK (
        similarity_type IN (
            'knowledge', 'method', 'structure', 'solution_path',
            'semantic', 'variant', 'prerequisite', 'contrast'
        )
    ),
    score numeric(6,5) NOT NULL CHECK (score BETWEEN 0 AND 1),
    reason text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    generated_by text NOT NULL DEFAULT 'system'
        CHECK (generated_by IN ('system', 'rule', 'embedding', 'llm', 'human')),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'pending', 'rejected', 'deprecated')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_question_id <> target_question_id),
    UNIQUE (source_question_id, target_question_id, similarity_type)
);

COMMIT;
