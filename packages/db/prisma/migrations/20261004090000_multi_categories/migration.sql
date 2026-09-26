-- Items can carry any number of global categories: each single "categoryId"
-- becomes a "categoryIds" text array on the same row (so the table's RLS
-- covers it unchanged). Existing values carry over. A category in use is
-- archived, never deleted (routes/categories), so no id is left dangling.

ALTER TABLE "calendar_events" ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "calendar_events" SET "categoryIds" = ARRAY["categoryId"] WHERE "categoryId" IS NOT NULL;
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_categoryId_fkey";
ALTER TABLE "calendar_events" DROP COLUMN "categoryId";

ALTER TABLE "calendar_event_requests" ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "calendar_event_requests" SET "categoryIds" = ARRAY["categoryId"] WHERE "categoryId" IS NOT NULL;
ALTER TABLE "calendar_event_requests" DROP CONSTRAINT "calendar_event_requests_categoryId_fkey";
ALTER TABLE "calendar_event_requests" DROP COLUMN "categoryId";

ALTER TABLE "journal_posts" ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "journal_posts" SET "categoryIds" = ARRAY["categoryId"] WHERE "categoryId" IS NOT NULL;
ALTER TABLE "journal_posts" DROP CONSTRAINT "journal_posts_categoryId_fkey";
DROP INDEX "journal_posts_categoryId_idx";
ALTER TABLE "journal_posts" DROP COLUMN "categoryId";
CREATE INDEX "journal_posts_categoryIds_idx" ON "journal_posts" USING GIN ("categoryIds");

ALTER TABLE "tasks" ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "tasks" SET "categoryIds" = ARRAY["categoryId"] WHERE "categoryId" IS NOT NULL;
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_categoryId_fkey";
ALTER TABLE "tasks" DROP COLUMN "categoryId";

ALTER TABLE "child_notes" ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "child_notes" SET "categoryIds" = ARRAY["categoryId"] WHERE "categoryId" IS NOT NULL;
ALTER TABLE "child_notes" DROP CONSTRAINT "child_notes_categoryId_fkey";
ALTER TABLE "child_notes" DROP COLUMN "categoryId";
