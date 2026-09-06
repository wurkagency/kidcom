-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "height" INTEGER,
ADD COLUMN     "status" "MediaAssetStatus" NOT NULL DEFAULT 'PROCESSING',
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "journal_reactions" (
    "id" TEXT NOT NULL,
    "journalPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_reactions_journalPostId_userId_key" ON "journal_reactions"("journalPostId", "userId");

-- AddForeignKey
ALTER TABLE "journal_reactions" ADD CONSTRAINT "journal_reactions_journalPostId_fkey" FOREIGN KEY ("journalPostId") REFERENCES "journal_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_reactions" ADD CONSTRAINT "journal_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
