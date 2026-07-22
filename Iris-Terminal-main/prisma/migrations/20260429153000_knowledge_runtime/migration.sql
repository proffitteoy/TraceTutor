CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "vaults" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "name" TEXT NOT NULL,
    "root_path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "frontmatter" JSONB,
    "content_hash" TEXT NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "note_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "note_id" UUID NOT NULL,
    "heading_path" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "block_id" TEXT,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "start_line" INTEGER,
    "end_line" INTEGER,
    "embedding" VECTOR(1536),
    "tsv" tsvector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "note_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "source_note_id" UUID NOT NULL,
    "target_note_id" UUID,
    "target_path" TEXT NOT NULL,
    "link_text" TEXT,
    "link_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retrieval_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chat_id" UUID,
    "message_id" UUID,
    "query" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "recalled_items" JSONB NOT NULL,
    "final_context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retrieval_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaults_workspace_id_name_key" ON "vaults"("workspace_id", "name");
CREATE UNIQUE INDEX "notes_vault_id_path_key" ON "notes"("vault_id", "path");
CREATE INDEX "note_chunks_note_id_idx" ON "note_chunks"("note_id");
CREATE INDEX "note_links_vault_id_idx" ON "note_links"("vault_id");
CREATE INDEX "note_links_source_note_id_idx" ON "note_links"("source_note_id");
CREATE INDEX "note_links_target_note_id_idx" ON "note_links"("target_note_id");
CREATE INDEX "retrieval_events_chat_id_created_at_idx" ON "retrieval_events"("chat_id", "created_at");
CREATE INDEX "retrieval_events_message_id_idx" ON "retrieval_events"("message_id");
CREATE INDEX "note_chunks_tsv_idx" ON "note_chunks" USING GIN ("tsv");
CREATE INDEX "note_chunks_embedding_idx" ON "note_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

ALTER TABLE "vaults"
    ADD CONSTRAINT "vaults_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notes"
    ADD CONSTRAINT "notes_vault_id_fkey"
    FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_chunks"
    ADD CONSTRAINT "note_chunks_note_id_fkey"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_links"
    ADD CONSTRAINT "note_links_vault_id_fkey"
    FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_links"
    ADD CONSTRAINT "note_links_source_note_id_fkey"
    FOREIGN KEY ("source_note_id") REFERENCES "notes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_links"
    ADD CONSTRAINT "note_links_target_note_id_fkey"
    FOREIGN KEY ("target_note_id") REFERENCES "notes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "retrieval_events"
    ADD CONSTRAINT "retrieval_events_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chats"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "retrieval_events"
    ADD CONSTRAINT "retrieval_events_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION update_note_chunks_tsv()
RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('simple', coalesce(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_note_chunks_tsv
BEFORE INSERT OR UPDATE OF content ON "note_chunks"
FOR EACH ROW
EXECUTE FUNCTION update_note_chunks_tsv();
