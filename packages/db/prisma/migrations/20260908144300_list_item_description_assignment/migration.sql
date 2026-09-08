/*
  Warnings:

  - You are about to drop the `child_schedule_completions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "child_schedule_completions" DROP CONSTRAINT "child_schedule_completions_childId_fkey";

-- DropForeignKey
ALTER TABLE "child_schedule_completions" DROP CONSTRAINT "child_schedule_completions_templateId_fkey";

-- AlterTable
ALTER TABLE "list_items" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "medical_schedule_templates" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "recurrenceMonths" INTEGER;

-- DropTable
DROP TABLE "child_schedule_completions";

-- CreateTable
CREATE TABLE "child_schedule_occurrences" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "plannedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_schedule_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "child_schedule_occurrences_childId_templateId_sequence_key" ON "child_schedule_occurrences"("childId", "templateId", "sequence");

-- AddForeignKey
ALTER TABLE "child_schedule_occurrences" ADD CONSTRAINT "child_schedule_occurrences_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_schedule_occurrences" ADD CONSTRAINT "child_schedule_occurrences_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "medical_schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
