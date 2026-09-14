-- Phase 6 (spec §1.3): the value this column held was already migrated into
-- ChildAccess.relationship in the Phase 5 migration
-- (20260914110000_relationship_type). Safe to drop now that Phase 5 has run
-- and been verified against real dev data.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "parentRole";

-- DropEnum
DROP TYPE "ParentRole";
