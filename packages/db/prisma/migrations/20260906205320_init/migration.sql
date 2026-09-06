-- CreateEnum
CREATE TYPE "FamilyMemberType" AS ENUM ('CO_PARENT', 'GRANDPARENT', 'AUNT_UNCLE', 'SIBLING', 'CAREGIVER', 'OTHER');

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "isMedical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "child_access" ADD COLUMN     "familyMemberType" "FamilyMemberType";

-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "familyMemberType" "FamilyMemberType";
