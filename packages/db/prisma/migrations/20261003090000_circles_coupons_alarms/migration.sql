-- CreateEnum
CREATE TYPE "SuspensionReason" AS ENUM ('CHILD_SUSPENDED', 'CIRCLE_ENDED', 'LEGAL_HOLD');

-- CreateEnum
CREATE TYPE "AlarmStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "upgrade_requests" DROP CONSTRAINT "upgrade_requests_childId_fkey";

-- DropForeignKey
ALTER TABLE "upgrade_requests" DROP CONSTRAINT "upgrade_requests_requestedById_fkey";

-- AlterTable
ALTER TABLE "child_access" ADD COLUMN     "grantedViaCircleId" TEXT;

-- AlterTable
ALTER TABLE "children" ADD COLUMN     "circleId" TEXT,
ADD COLUMN     "deleteAfter" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionNotices" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "circleId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "trialReminder1SentAt" TIMESTAMP(3),
ADD COLUMN     "trialReminder7SentAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "child_coverage";

-- DropTable
DROP TABLE "upgrade_requests";

-- DropEnum
DROP TYPE "UpgradeRequestStatus";

-- CreateTable
CREATE TABLE "suspended_child_access" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AccessRole" NOT NULL,
    "relationship" "RelationshipType" NOT NULL,
    "medicalInfoAccess" BOOLEAN NOT NULL DEFAULT false,
    "isMinorMember" BOOLEAN NOT NULL DEFAULT false,
    "grantedViaCircleId" TEXT,
    "originalCreatedAt" TIMESTAMP(3) NOT NULL,
    "reason" "SuspensionReason" NOT NULL,
    "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suspended_child_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_members" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "lifetime" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarms" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "childId" TEXT,
    "userId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AlarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suspended_child_access_userId_idx" ON "suspended_child_access"("userId");

-- CreateIndex
CREATE INDEX "suspended_child_access_grantedViaCircleId_idx" ON "suspended_child_access"("grantedViaCircleId");

-- CreateIndex
CREATE UNIQUE INDEX "suspended_child_access_childId_userId_key" ON "suspended_child_access"("childId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "circle_members_userId_key" ON "circle_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_couponId_userId_key" ON "coupon_redemptions"("couponId", "userId");

-- CreateIndex
CREATE INDEX "alarms_mediaAssetId_idx" ON "alarms"("mediaAssetId");

-- CreateIndex
CREATE INDEX "alarms_childId_idx" ON "alarms"("childId");

-- CreateIndex
CREATE INDEX "alarms_userId_idx" ON "alarms"("userId");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_access" ADD CONSTRAINT "child_access_grantedViaCircleId_fkey" FOREIGN KEY ("grantedViaCircleId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspended_child_access" ADD CONSTRAINT "suspended_child_access_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspended_child_access" ADD CONSTRAINT "suspended_child_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: children whose parent or guardian holds an active paid
-- subscription go into that parent's Circle (subscription model rule 1).
UPDATE "children" c SET "circleId" = s."id"
FROM "child_access" ca JOIN "subscriptions" s ON s."ownerId" = ca."userId"
WHERE ca."childId" = c."id" AND ca."role" IN ('PARENT', 'GUARDIAN')
  AND s."tier" <> 'FREE' AND s."status" IN ('ACTIVE', 'TRIALING') AND c."circleId" IS NULL;
