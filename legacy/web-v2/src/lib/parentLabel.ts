import type { ChildFamilyMember, RelationshipType } from "@kidcom/shared";

// Turns a family's real relationship values into the calendar's "Dad's
// Time" / "Mom's Time" custody labels (calendar_week_view /
// calendar_month_view mockups) instead of the old positional "first two
// PARENT members -> primary/secondary" guess. Client-only — this is UI
// copy, not a data contract, so it doesn't belong in packages/shared.
// Reads ChildFamilyMember.relationship (per-child, spec §1.3/Phase 6) —
// this is a strict improvement over the old account-level ParentRole it
// replaced, since a person really can be Dad to one child and Uncle to
// another.
//
// Falls back to the member's first name whenever FATHER/MOTHER can't be
// used unambiguously: the userId isn't found, their relationship is the
// neutral PARENT (or anything else non-parental), or another family member
// shares the same FATHER/MOTHER relationship on this child (two dads, two
// moms, or a mixed household where relationships don't map 1:1 to "the two
// custody parents").
function findMember(members: ChildFamilyMember[], userId: string): ChildFamilyMember | undefined {
  return members.find((m) => m.userId === userId);
}

function relationshipIsUnambiguous(members: ChildFamilyMember[], relationship: RelationshipType, userId: string): boolean {
  return members.filter((m) => m.relationship === relationship).every((m) => m.userId === userId);
}

export function resolveParentTimeLabel(members: ChildFamilyMember[], userId: string | null): string {
  if (!userId) return "Unassigned";
  const member = findMember(members, userId);
  if (!member) return "Unassigned";
  const relationship = member.relationship;
  if (relationship === "FATHER" && relationshipIsUnambiguous(members, "FATHER", userId)) return "Dad's Time";
  if (relationship === "MOTHER" && relationshipIsUnambiguous(members, "MOTHER", userId)) return "Mom's Time";
  return `${member.firstName}'s Time`;
}

export function resolveParentShortLabel(members: ChildFamilyMember[], userId: string | null): string {
  if (!userId) return "Unassigned";
  const member = findMember(members, userId);
  if (!member) return "Unassigned";
  const relationship = member.relationship;
  if (relationship === "FATHER" && relationshipIsUnambiguous(members, "FATHER", userId)) return "Dad";
  if (relationship === "MOTHER" && relationshipIsUnambiguous(members, "MOTHER", userId)) return "Mom";
  return member.firstName;
}
