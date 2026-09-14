-- Phase 6a (spec §1.5/9.20). See the AccessGrantEvent model comment in
-- schema.prisma for the privacy/aggregation constraints this table exists
-- under.

-- CreateTable
CREATE TABLE "access_grant_events" (
    "id" TEXT NOT NULL,
    "relationship" "RelationshipType" NOT NULL,
    "inviterRelationship" "RelationshipType",
    "timeToAcceptMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grant_events_pkey" PRIMARY KEY ("id")
);
