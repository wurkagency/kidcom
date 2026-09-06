/*
  Warnings:

  - You are about to drop the column `childId` on the `journal_posts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[avatarForUserId]` on the table `media_assets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[avatarForChildId]` on the table `media_assets` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "journal_posts" DROP CONSTRAINT "journal_posts_childId_fkey";

-- AlterTable
ALTER TABLE "journal_posts" DROP COLUMN "childId";

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "avatarForChildId" TEXT,
ADD COLUMN     "avatarForUserId" TEXT;

-- CreateTable
CREATE TABLE "journal_post_children" (
    "id" TEXT NOT NULL,
    "journalPostId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "journal_post_children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_post_children_journalPostId_childId_key" ON "journal_post_children"("journalPostId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_avatarForUserId_key" ON "media_assets"("avatarForUserId");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_avatarForChildId_key" ON "media_assets"("avatarForChildId");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_avatarForUserId_fkey" FOREIGN KEY ("avatarForUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_avatarForChildId_fkey" FOREIGN KEY ("avatarForChildId") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_post_children" ADD CONSTRAINT "journal_post_children_journalPostId_fkey" FOREIGN KEY ("journalPostId") REFERENCES "journal_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_post_children" ADD CONSTRAINT "journal_post_children_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
