-- TraceTutor PostgreSQL migration 007: secure schema defaults and app roles.
BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracetutor_asset_reader') THEN
        CREATE ROLE tracetutor_asset_reader NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracetutor_asset_writer') THEN
        CREATE ROLE tracetutor_asset_writer NOLOGIN;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO tracetutor_asset_reader, tracetutor_asset_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tracetutor_asset_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tracetutor_asset_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tracetutor_asset_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO tracetutor_asset_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tracetutor_asset_writer;

COMMIT;
