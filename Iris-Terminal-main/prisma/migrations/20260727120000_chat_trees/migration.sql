CREATE TABLE "chat_trees" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "chat_trees_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "chats"
    ADD COLUMN "tree_id" UUID,
    ADD COLUMN "source_chat_id" UUID,
    ADD COLUMN "source_message_id" UUID,
    ADD COLUMN "card_relation" TEXT NOT NULL DEFAULT 'root',
    ADD COLUMN "source_quote" TEXT,
    ADD COLUMN "selection_start" INTEGER,
    ADD COLUMN "selection_end" INTEGER,
    ADD COLUMN "fork_sequence_number" INTEGER,
    ADD COLUMN "branch_context" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "card_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "card_y" DOUBLE PRECISION NOT NULL DEFAULT 0;

INSERT INTO "chat_trees" ("id", "user_id", "workspace_id", "created_at", "updated_at")
SELECT "id", "user_id", "workspace_id", "created_at", "updated_at"
FROM "chats";

UPDATE "chats"
SET "tree_id" = "id"
WHERE "tree_id" IS NULL;

ALTER TABLE "chats"
    ALTER COLUMN "tree_id" SET NOT NULL;

CREATE INDEX "chat_trees_workspace_id_idx" ON "chat_trees"("workspace_id");
CREATE INDEX "chats_tree_id_idx" ON "chats"("tree_id");
CREATE INDEX "chats_source_chat_id_idx" ON "chats"("source_chat_id");
CREATE INDEX "chats_source_message_id_idx" ON "chats"("source_message_id");

ALTER TABLE "chat_trees"
    ADD CONSTRAINT "chat_trees_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_trees"
    ADD CONSTRAINT "chat_trees_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chats"
    ADD CONSTRAINT "chats_tree_id_fkey"
    FOREIGN KEY ("tree_id") REFERENCES "chat_trees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chats"
    ADD CONSTRAINT "chats_source_chat_id_fkey"
    FOREIGN KEY ("source_chat_id") REFERENCES "chats"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chats"
    ADD CONSTRAINT "chats_source_message_id_fkey"
    FOREIGN KEY ("source_message_id") REFERENCES "messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
