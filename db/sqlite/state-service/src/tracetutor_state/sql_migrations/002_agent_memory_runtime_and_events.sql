-- Agent short-term memory, active context, runtime recovery, local event sourcing,
-- and scoped system configuration.

CREATE TABLE agent_memory_item (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL
        CHECK (memory_type IN ('short_term', 'working', 'learning_preference', 'open_loop', 'warning', 'strategy')),
    title TEXT NOT NULL,
    content_text TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id TEXT,
    related_entity_name TEXT,
    importance_score REAL NOT NULL DEFAULT 0.5 CHECK (importance_score BETWEEN 0.0 AND 1.0),
    freshness_score REAL NOT NULL DEFAULT 1.0 CHECK (freshness_score BETWEEN 0.0 AND 1.0),
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'resolved', 'expired', 'deprecated')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE active_context_ref (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE CASCADE,
    ref_type TEXT NOT NULL
        CHECK (ref_type IN ('active_question', 'active_attempt', 'active_workflow', 'active_topic', 'active_review')),
    ref_id TEXT NOT NULL,
    ref_name TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'resolved', 'abandoned')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, session_id, ref_type, ref_id)
);

CREATE TABLE agent_runtime_state (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    state_key TEXT NOT NULL,
    state_value_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'superseded', 'cleared')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, session_id, agent_name, state_key)
);

CREATE TABLE local_event_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES user_profile(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES learning_session(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    aggregate_type TEXT,
    aggregate_id TEXT,
    event_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_kv (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global'
        CHECK (scope IN ('global', 'user', 'session')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
