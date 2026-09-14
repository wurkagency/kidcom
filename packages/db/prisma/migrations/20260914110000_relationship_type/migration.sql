-- Phase 5 (spec §1.3/§8, R16) — replaces FamilyMemberType with
-- RelationshipType and migrates every existing row honestly instead of
-- dropping the old column blind. This is the one lossy step in the whole
-- roles/subscription build — see the mapping table in
-- tasks/todo.md's Phase 5 entry and the dry-run report attached there
-- before this was ever run for real.
--
-- Mapping applied below, in order:
--   ChildAccess.role = 'PARENT'   -> relationship = that user's own
--                                    User.parentRole (FATHER/MOTHER/PARENT).
--                                    Applies uniformly whether the row came
--                                    from a direct child-creation or an
--                                    accepted CO_PARENT invite — both cases
--                                    already have the user's own
--                                    self-declared parentRole sitting on
--                                    User (AcceptInviteRequest.parentRole is
--                                    self-selected by the invitee, not
--                                    inferred from anyone else — see
--                                    routes/invites/index.ts), so there is
--                                    no "counterpart" to infer; each
--                                    parent's own row already carries their
--                                    own answer.
--   ChildAccess.role = 'GUARDIAN' -> relationship = 'GUARDIAN' (no real rows
--                                    exist yet — GUARDIAN was only added in
--                                    Phase 4 — but handled for completeness).
--   ChildAccess.role = 'FAMILY', familyMemberType:
--     'CO_PARENT'   -> 'PARENT'   (defensive only — familyMemberTypeToRole
--                                  always mapped CO_PARENT to role PARENT,
--                                  so no real row should hit this branch;
--                                  included so the migration can't silently
--                                  leave a row NULL if that invariant was
--                                  ever violated).
--     'GRANDPARENT' -> 'GRANDMOTHER_PAT'  (arbitrary, undecidable — no
--                                  gender/side was ever stored. Flagged
--                                  loudly: any real GRANDPARENT row must be
--                                  self-corrected by that person via the
--                                  relationship picker after this ships.)
--     'AUNT_UNCLE'  -> 'AUNT'     (arbitrary, same reasoning)
--     'SIBLING'     -> 'SISTER'   (arbitrary, same reasoning)
--     'CAREGIVER'   -> 'CAREGIVER' (exact, no ambiguity)
--     'OTHER'       -> 'OTHER'    (exact, no ambiguity)
--     NULL          -> 'OTHER'    (defensive only — a FAMILY-role row with
--                                  no familyMemberType shouldn't exist in
--                                  practice; every invite-accept path always
--                                  copies a non-null value for FAMILY roles)
--   Invite.familyMemberType -> Invite.relationship: same value mapping as
--     above, applied directly (no role/user join available or needed for a
--     not-yet-accepted invite) — 'CO_PARENT' -> 'PARENT' here too, for the
--     same reason.

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('FATHER', 'MOTHER', 'PARENT', 'STEP_FATHER', 'STEP_MOTHER', 'FOSTER_FATHER', 'FOSTER_MOTHER', 'GUARDIAN', 'GRANDFATHER_PAT', 'GRANDFATHER_MAT', 'GRANDMOTHER_PAT', 'GRANDMOTHER_MAT', 'UNCLE', 'AUNT', 'BROTHER', 'SISTER', 'CAREGIVER', 'OTHER');

-- Add both new columns nullable first — backfilled below, then
-- child_access.relationship is tightened to NOT NULL once every row has a
-- value. invites.relationship stays nullable, matching the old column's
-- nullability (an invite in flight may not have one set yet at the DB
-- level, even though app validation always requires it on creation).
ALTER TABLE "child_access" ADD COLUMN "relationship" "RelationshipType";
ALTER TABLE "invites" ADD COLUMN "relationship" "RelationshipType";

-- Backfill child_access: PARENT-role rows from the user's own self-declared
-- parentRole.
UPDATE "child_access" ca
SET "relationship" = (
  CASE u."parentRole"
    WHEN 'FATHER' THEN 'FATHER'
    WHEN 'MOTHER' THEN 'MOTHER'
    ELSE 'PARENT'
  END
)::"RelationshipType"
FROM "users" u
WHERE ca."userId" = u.id AND ca."role" = 'PARENT';

-- Backfill child_access: GUARDIAN-role rows (none expected yet).
UPDATE "child_access"
SET "relationship" = 'GUARDIAN'::"RelationshipType"
WHERE "role" = 'GUARDIAN';

-- Backfill child_access: FAMILY-role rows, mapped from the old
-- familyMemberType per the table above.
UPDATE "child_access"
SET "relationship" = (
  CASE "familyMemberType"
    WHEN 'CO_PARENT' THEN 'PARENT'
    WHEN 'GRANDPARENT' THEN 'GRANDMOTHER_PAT'
    WHEN 'AUNT_UNCLE' THEN 'AUNT'
    WHEN 'SIBLING' THEN 'SISTER'
    WHEN 'CAREGIVER' THEN 'CAREGIVER'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE 'OTHER'
  END
)::"RelationshipType"
WHERE "role" = 'FAMILY';

-- Backfill invites.relationship the same way, straight from the old column
-- (no user join available/needed pre-accept).
UPDATE "invites"
SET "relationship" = (
  CASE "familyMemberType"
    WHEN 'CO_PARENT' THEN 'PARENT'
    WHEN 'GRANDPARENT' THEN 'GRANDMOTHER_PAT'
    WHEN 'AUNT_UNCLE' THEN 'AUNT'
    WHEN 'SIBLING' THEN 'SISTER'
    WHEN 'CAREGIVER' THEN 'CAREGIVER'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE NULL
  END
)::"RelationshipType"
WHERE "familyMemberType" IS NOT NULL;

-- Every child_access row must now have a relationship — enforce it.
ALTER TABLE "child_access" ALTER COLUMN "relationship" SET NOT NULL;

-- Drop the superseded columns and enum.
ALTER TABLE "child_access" DROP COLUMN "familyMemberType";
ALTER TABLE "invites" DROP COLUMN "familyMemberType";
DROP TYPE "FamilyMemberType";
