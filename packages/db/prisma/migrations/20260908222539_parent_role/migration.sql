/*
  Warnings:

  - A unique constraint covering the columns `[listItemImageForId]` on the table `media_assets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ParentRole" AS ENUM ('FATHER', 'MOTHER', 'PARENT');

-- AlterTable
ALTER TABLE "journal_posts" ALTER COLUMN "text" DROP NOT NULL;

-- AlterTable
ALTER TABLE "list_items" ADD COLUMN     "calendarEventId" TEXT;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "listItemImageForId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "parentRole" "ParentRole" NOT NULL DEFAULT 'PARENT';

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_listItemImageForId_key" ON "media_assets"("listItemImageForId");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_listItemImageForId_fkey" FOREIGN KEY ("listItemImageForId") REFERENCES "list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
