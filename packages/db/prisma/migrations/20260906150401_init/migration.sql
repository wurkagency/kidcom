/*
  Warnings:

  - A unique constraint covering the columns `[token]` on the table `invites` will be added. If there are existing duplicate values, this will fail.
  - The required column `token` was added to the `invites` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "MedicalInfoCategory" AS ENUM ('ALLERGY', 'CONDITION');

-- CreateEnum
CREATE TYPE "EmergencyContactCategory" AS ENUM ('FAMILY', 'MEDICAL', 'OTHER');

-- AlterTable
ALTER TABLE "growth_entries" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "token" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "medical_info" ADD COLUMN     "category" "MedicalInfoCategory" NOT NULL DEFAULT 'CONDITION';

-- CreateTable
CREATE TABLE "child_schedule_completions" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_schedule_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "category" "EmergencyContactCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "child_schedule_completions_childId_templateId_key" ON "child_schedule_completions"("childId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- AddForeignKey
ALTER TABLE "child_schedule_completions" ADD CONSTRAINT "child_schedule_completions_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_schedule_completions" ADD CONSTRAINT "child_schedule_completions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "medical_schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
