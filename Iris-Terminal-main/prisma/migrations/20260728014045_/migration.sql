-- DropIndex
DROP INDEX "note_chunks_embedding_idx";

-- DropIndex
DROP INDEX "note_chunks_tsv_idx";

-- AlterTable
ALTER TABLE "note_chunks" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "note_links" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notes" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "retrieval_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vaults" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;
