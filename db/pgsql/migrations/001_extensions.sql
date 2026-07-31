-- TraceTutor PostgreSQL migration 001: required extensions.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMIT;
