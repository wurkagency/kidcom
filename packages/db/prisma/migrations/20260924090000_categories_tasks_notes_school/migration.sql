-- v3.0 Phase 3: global categories (shared by Calendar, Moments, Media),
-- event place/address/assignee, packing checklists, custody handover time
-- and place, and four new child-scoped tables (tasks, shared notes, school
-- timetable, handover packing) under the same row-level security as every
-- other child table.
--
-- Hand-ordered: the old CalendarEventCategory values are copied into the
-- new categoryId before the enum column is dropped, so no event loses its
-- category.

CREATE TYPE "CalendarEventKind" AS ENUM ('EVENT', 'NATIONAL_HOLIDAY');
CREATE TYPE "CategoryTone" AS ENUM ('NEUTRAL', 'SAGE', 'ROSE', 'SAND');
CREATE TYPE "ChecklistKind" AS ENUM ('TASK', 'PACKING');

-- Categories + the system set (packages/shared/src/categories.ts)
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "ownerId" TEXT,
    "name" TEXT,
    "icon" TEXT NOT NULL,
    "tone" "CategoryTone" NOT NULL DEFAULT 'NEUTRAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");
CREATE INDEX "categories_ownerId_idx" ON "categories"("ownerId");
ALTER TABLE "categories" ADD CONSTRAINT "categories_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "categories" ("id", "key", "icon", "tone", "sortOrder", "updatedAt") VALUES
  ('cat_routine', 'routine', 'repeat', 'SAGE', 0, CURRENT_TIMESTAMP),
  ('cat_appointment', 'appointment', 'event', 'NEUTRAL', 1, CURRENT_TIMESTAMP),
  ('cat_health', 'health', 'health_and_safety', 'ROSE', 2, CURRENT_TIMESTAMP),
  ('cat_school', 'school', 'school', 'SAGE', 3, CURRENT_TIMESTAMP),
  ('cat_sport', 'sport', 'sports_soccer', 'SAND', 4, CURRENT_TIMESTAMP),
  ('cat_playdate', 'playdate', 'toys', 'SAND', 5, CURRENT_TIMESTAMP),
  ('cat_vacation', 'vacation', 'beach_access', 'SAND', 6, CURRENT_TIMESTAMP),
  ('cat_holiday', 'holiday', 'flag', 'NEUTRAL', 7, CURRENT_TIMESTAMP),
  ('cat_milestone', 'milestone', 'star', 'SAGE', 8, CURRENT_TIMESTAMP),
  ('cat_outdoor', 'outdoor', 'park', 'SAGE', 9, CURRENT_TIMESTAMP),
  ('cat_creative', 'creative', 'palette', 'SAND', 10, CURRENT_TIMESTAMP);

-- The tables below use FORCE ROW LEVEL SECURITY, which applies to this
-- migration's own connection too: without the bypass flag every UPDATE
-- would match zero rows and the old categories would be lost when the
-- column is dropped. Session-level, switched off again after the copy.
SELECT set_config('app.bypass_rls', 'on', false);

-- Calendar events: new columns, copy the enum across, then drop it
ALTER TABLE "calendar_events"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "kind" "CalendarEventKind" NOT NULL DEFAULT 'EVENT';
UPDATE "calendar_events" SET
  "categoryId" = CASE "category"::text
    WHEN 'APPOINTMENT' THEN 'cat_appointment'
    WHEN 'MEDICAL' THEN 'cat_health'
    WHEN 'SCHOOL' THEN 'cat_school'
    WHEN 'ACTIVITY' THEN 'cat_sport'
    WHEN 'HOLIDAY' THEN 'cat_holiday'
    WHEN 'PLANNED_HOLIDAY' THEN 'cat_vacation'
    ELSE 'cat_appointment'
  END,
  "kind" = CASE WHEN "category"::text = 'HOLIDAY' THEN 'NATIONAL_HOLIDAY'::"CalendarEventKind" ELSE 'EVENT'::"CalendarEventKind" END;
ALTER TABLE "calendar_events" DROP COLUMN "category";

ALTER TABLE "calendar_event_requests" ADD COLUMN "categoryId" TEXT;
UPDATE "calendar_event_requests" SET "categoryId" = CASE "category"::text
    WHEN 'APPOINTMENT' THEN 'cat_appointment'
    WHEN 'MEDICAL' THEN 'cat_health'
    WHEN 'SCHOOL' THEN 'cat_school'
    WHEN 'ACTIVITY' THEN 'cat_sport'
    WHEN 'HOLIDAY' THEN 'cat_holiday'
    WHEN 'PLANNED_HOLIDAY' THEN 'cat_vacation'
    ELSE 'cat_appointment'
  END;
ALTER TABLE "calendar_event_requests" DROP COLUMN "category";

DROP TYPE "CalendarEventCategory";

SELECT set_config('app.bypass_rls', 'off', false);

ALTER TABLE "calendar_event_checklist_items" ADD COLUMN "kind" "ChecklistKind" NOT NULL DEFAULT 'TASK';
ALTER TABLE "custody_plans" ADD COLUMN "handoverLocation" TEXT, ADD COLUMN "handoverTime" TEXT;

-- New child-scoped tables
-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "categoryId" TEXT,
    "dueOn" DATE,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "child_notes" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_notes_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "school_lessons" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "subject" TEXT NOT NULL,
    "room" TEXT,
    "note" TEXT,
    "bring" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_lessons_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "handover_packing_items" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "packedFor" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_packing_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_childId_completedAt_idx" ON "tasks"("childId", "completedAt");
-- CreateIndex
CREATE INDEX "child_notes_childId_createdAt_idx" ON "child_notes"("childId", "createdAt");
-- CreateIndex
CREATE INDEX "school_lessons_childId_weekday_idx" ON "school_lessons"("childId", "weekday");
-- CreateIndex
CREATE INDEX "handover_packing_items_childId_idx" ON "handover_packing_items"("childId");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "calendar_event_requests" ADD CONSTRAINT "calendar_event_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "child_notes" ADD CONSTRAINT "child_notes_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "child_notes" ADD CONSTRAINT "child_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "child_notes" ADD CONSTRAINT "child_notes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "school_lessons" ADD CONSTRAINT "school_lessons_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "handover_packing_items" ADD CONSTRAINT "handover_packing_items_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (same policy shape as rls_full_rollout)
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tasks_rls" ON "tasks"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "tasks"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "tasks"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "child_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "child_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "child_notes_rls" ON "child_notes"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "child_notes"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "child_notes"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "school_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_lessons" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_lessons_rls" ON "school_lessons"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "school_lessons"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "school_lessons"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );

ALTER TABLE "handover_packing_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_packing_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "handover_packing_items_rls" ON "handover_packing_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "handover_packing_items"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "child_access" WHERE "child_access"."childId" = "handover_packing_items"."childId" AND "child_access"."userId" = current_setting('app.current_user_id', true))
  );
