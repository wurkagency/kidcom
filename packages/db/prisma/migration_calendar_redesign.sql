-- Calendar redesign migration (Month/Week/List views) — hand-authored because
-- `prisma migrate dev` can't run in the build sandbox (network-blocked) and
-- can't auto-generate the data backfill step below anyway.
--
-- Fully idempotent: every step checks current DB state first, so this is
-- safe to run even if your local Postgres was already created fresh via
-- `prisma db push` against the current schema.prisma (in which case
-- isMedical/isSport never existed and the new tables/columns may already
-- be there) or if a previous partial run already applied some of it.
--
-- After running this, regenerate the Prisma client:
--   npm run prisma:generate

-- 1. Extend the CalendarEventCategory enum with the new taxonomy. CUSTODY
--    already existed in the enum but was unused by the API; MEDICAL, SCHOOL
--    and ACTIVITY are new.
ALTER TYPE "CalendarEventCategory" ADD VALUE IF NOT EXISTS 'MEDICAL';
ALTER TYPE "CalendarEventCategory" ADD VALUE IF NOT EXISTS 'SCHOOL';
ALTER TYPE "CalendarEventCategory" ADD VALUE IF NOT EXISTS 'ACTIVITY';

-- Postgres requires a new enum value to be committed before it can be used
-- in a DML statement in the same connection, so everything below runs as
-- its own statements rather than one wrapping transaction (prisma db
-- execute already runs the whole file outside an explicit transaction by
-- default when no BEGIN/COMMIT is present, which is what we want here).

-- 2. Backfill: fold the old isMedical/isSport booleans into the new
--    category values BEFORE dropping the columns. Guarded — skipped
--    entirely if those columns don't exist (fresh DB created directly from
--    the current schema, or a previous run already dropped them).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'isMedical'
  ) THEN
    UPDATE "calendar_events" SET "category" = 'MEDICAL' WHERE "category" = 'APPOINTMENT' AND "isMedical" = true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'isSport'
  ) THEN
    UPDATE "calendar_events" SET "category" = 'ACTIVITY' WHERE "category" = 'APPOINTMENT' AND "isSport" = true;
  END IF;
END $$;

-- 3. Drop the now-redundant boolean columns, if present.
ALTER TABLE "calendar_events" DROP COLUMN IF EXISTS "isMedical";
ALTER TABLE "calendar_events" DROP COLUMN IF EXISTS "isSport";

-- 4. New optional fields on CalendarEvent.
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "assignedNote"  TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "contactName"   TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "contactDetail" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "confirmable"   BOOLEAN NOT NULL DEFAULT false;

-- 5. New tables.
CREATE TABLE IF NOT EXISTS "calendar_event_checklist_items" (
    "id"              TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "isChecked"       BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"       INTEGER NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "calendar_event_checklist_items_calendarEventId_idx"
    ON "calendar_event_checklist_items"("calendarEventId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_event_checklist_items_calendarEventId_fkey'
  ) THEN
    ALTER TABLE "calendar_event_checklist_items"
      ADD CONSTRAINT "calendar_event_checklist_items_calendarEventId_fkey"
      FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "calendar_event_confirmations" (
    "id"              TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "confirmedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_confirmations_calendarEventId_userId_key"
    ON "calendar_event_confirmations"("calendarEventId", "userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_event_confirmations_calendarEventId_fkey'
  ) THEN
    ALTER TABLE "calendar_event_confirmations"
      ADD CONSTRAINT "calendar_event_confirmations_calendarEventId_fkey"
      FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_event_confirmations_userId_fkey'
  ) THEN
    ALTER TABLE "calendar_event_confirmations"
      ADD CONSTRAINT "calendar_event_confirmations_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
