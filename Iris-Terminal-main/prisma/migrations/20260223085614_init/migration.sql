-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "bio" TEXT NOT NULL DEFAULT '',
    "has_onboarded" BOOLEAN NOT NULL DEFAULT true,
    "image_url" TEXT NOT NULL DEFAULT '',
    "image_path" TEXT NOT NULL DEFAULT '',
    "profile_context" TEXT NOT NULL DEFAULT '',
    "display_name" TEXT NOT NULL DEFAULT 'Local User',
    "use_azure_openai" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT 'local_user',
    "anthropic_api_key" TEXT,
    "azure_openai_35_turbo_id" TEXT,
    "azure_openai_45_turbo_id" TEXT,
    "azure_openai_45_vision_id" TEXT,
    "azure_openai_api_key" TEXT,
    "azure_openai_endpoint" TEXT,
    "google_gemini_api_key" TEXT,
    "mistral_api_key" TEXT,
    "openai_api_key" TEXT,
    "openai_organization_id" TEXT,
    "perplexity_api_key" TEXT,
    "openrouter_api_key" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "sharing" TEXT NOT NULL DEFAULT 'private',
    "default_context_length" INTEGER NOT NULL,
    "default_model" TEXT NOT NULL,
    "default_prompt" TEXT NOT NULL,
    "default_temperature" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "embeddings_provider" TEXT NOT NULL,
    "include_profile_context" BOOLEAN NOT NULL,
    "include_workspace_instructions" BOOLEAN NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "is_home" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image_path" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "assistant_id" TEXT,
    "folder_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "sharing" TEXT NOT NULL DEFAULT 'private',
    "context_length" INTEGER NOT NULL,
    "embeddings_provider" TEXT NOT NULL,
    "include_profile_context" BOOLEAN NOT NULL,
    "include_workspace_instructions" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assistant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "image_paths" TEXT[],
    "model" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "folder_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "sharing" TEXT NOT NULL DEFAULT 'private',
    "description" TEXT NOT NULL DEFAULT '',
    "file_path" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_items" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "sharing" TEXT NOT NULL DEFAULT 'private',
    "content" TEXT NOT NULL,
    "local_embedding" JSONB,
    "openai_embedding" JSONB,
    "tokens" INTEGER NOT NULL,

    CONSTRAINT "file_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_workspaces" (
    "user_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "file_workspaces_pkey" PRIMARY KEY ("file_id","workspace_id")
);

-- CreateTable
CREATE TABLE "chat_files" (
    "user_id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "chat_files_pkey" PRIMARY KEY ("chat_id","file_id")
);

-- CreateTable
CREATE TABLE "message_file_items" (
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_item_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "message_file_items_pkey" PRIMARY KEY ("message_id","file_item_id")
);

-- CreateTable
CREATE TABLE "chat_summaries" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'completed',
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "local_embedding" JSONB,
    "openai_embedding" JSONB,

    CONSTRAINT "chat_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_summaries_chat_id_key" ON "chat_summaries"("chat_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_items" ADD CONSTRAINT "file_items_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_items" ADD CONSTRAINT "file_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_workspaces" ADD CONSTRAINT "file_workspaces_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_workspaces" ADD CONSTRAINT "file_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_file_items" ADD CONSTRAINT "message_file_items_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_file_items" ADD CONSTRAINT "message_file_items_file_item_id_fkey" FOREIGN KEY ("file_item_id") REFERENCES "file_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
