-- Phase 7 (spec §2.2/§4.3/§8) — I-2's per-user trial fields, and the
-- ChildCoverage table (population deferred to Phase 8 — see its model
-- comment in schema.prisma).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "child_coverage" (
    "childId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_coverage_pkey" PRIMARY KEY ("childId","subscriptionId")
);
