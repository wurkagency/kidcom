-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "isSport" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "recurrenceEndsAt" TIMESTAMP(3),
ADD COLUMN     "recurrenceIntervalWeeks" INTEGER;
