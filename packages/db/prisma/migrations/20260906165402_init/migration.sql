/*
  Warnings:

  - You are about to drop the column `custodyPlanId` on the `calendar_events` table. All the data in the column will be lost.
  - You are about to drop the column `calendarEventId` on the `swap_requests` table. All the data in the column will be lost.
  - Added the required column `childId` to the `swap_requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `swap_requests` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_custodyPlanId_fkey";

-- DropForeignKey
ALTER TABLE "swap_requests" DROP CONSTRAINT "swap_requests_calendarEventId_fkey";

-- AlterTable
ALTER TABLE "calendar_events" DROP COLUMN "custodyPlanId";

-- AlterTable
ALTER TABLE "swap_requests" DROP COLUMN "calendarEventId",
ADD COLUMN     "childId" TEXT NOT NULL,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
