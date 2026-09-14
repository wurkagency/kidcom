-- Backfills a migration file for schema drift that predates this session:
-- the real dev database already had these calendar_events columns and the
-- two new tables below (confirmed via `psql \d calendar_events` and a
-- `prisma migrate diff` against a freshly-migrated database), but no
-- migration file ever captured the change — it was applied out-of-band
-- (almost certainly `prisma db push` during earlier chunk-based
-- development), before any work in this session began. See
-- tasks/lessons.md, "The migration history doesn't fully describe the real
-- dev DB" for the original discovery of this drift.
--
-- Written idempotently (IF NOT EXISTS / IF EXISTS / exception-guarded adds)
-- rather than as a plain one-shot migration: unlike dev, this session has
-- no way to inspect the production database's actual current state before
-- this ships, and DEPLOYMENT.md's production database may or may not have
-- the same undocumented drift dev did. Written this way, `prisma migrate
-- deploy` is correct either way — it creates these columns/tables for real
-- on a database that never had them, and harmlessly no-ops on one that
-- (like dev) already does — with no manual `prisma migrate resolve
-- --applied` step required on any target.

-- AlterEnum — idempotent: PostgreSQL (9.6+) supports ADD VALUE IF NOT
-- EXISTS directly, and this file was confirmed (by an actual run against a
-- fresh PG16 database in this session) to work as a single-file migration
-- without needing PostgreSQL 11-and-earlier's one-value-per-migration
-- workaround.
ALTER TYPE "CalendarEventCategory" ADD VALUE IF NOT EXISTS 'MEDICAL';
ALTER TYPE "CalendarEventCategory" ADD VALUE IF NOT EXISTS 'SCHOOL';
ALTER TYPE "CalendarEventCategory" ADD VALUE IF NOT EXISTS 'ACTIVITY';

-- AlterTable — idempotent
ALTER TABLE "calendar_events" DROP COLUMN IF EXISTS "isMedical";
ALTER TABLE "calendar_events" DROP COLUMN IF EXISTS "isSport";
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "assignedNote" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "confirmable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "contactDetail" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "contactName" TEXT;

-- CreateTable — idempotent. Assumes that if these tables already exist on a
-- given target (as they do on dev), they already have exactly this shape —
-- true for dev (same schema.prisma lineage, same out-of-band `db push`),
-- and the reasonable assumption for production too, since it runs the same
-- application code against the same table names.
CREATE TABLE IF NOT EXISTS "calendar_event_checklist_items" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "calendar_event_confirmations" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — idempotent
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_confirmations_calendarEventId_userId_key" ON "calendar_event_confirmations"("calendarEventId", "userId");

-- AddForeignKey — Postgres has no ADD CONSTRAINT ... IF NOT EXISTS, so each
-- is wrapped to swallow the "already exists" case specifically (duplicate_object)
-- and re-raise anything else.
DO $$ BEGIN
    ALTER TABLE "calendar_event_checklist_items" ADD CONSTRAINT "calendar_event_checklist_items_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "calendar_event_confirmations" ADD CONSTRAINT "calendar_event_confirmations_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "calendar_event_confirmations" ADD CONSTRAINT "calendar_event_confirmations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
