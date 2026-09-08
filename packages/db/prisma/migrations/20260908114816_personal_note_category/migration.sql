-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('ROUTINE', 'MILESTONE', 'HEALTH', 'GENERAL');

-- AlterTable
ALTER TABLE "personal_notes" ADD COLUMN     "category" "NoteCategory";
