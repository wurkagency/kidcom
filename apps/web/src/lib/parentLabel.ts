import type { ChildFamilyMember, ParentRole } from "@kidcom/shared";

// Turns a family's real parentRole values into the calendar's "Dad's Time" /
// "Mom's Time" custody labels (calendar_week_view / calendar_month_view
// mockups) instead of the old positional "first two PARENT members ->
// primary/secondary" guess. Client-only — this is UI copy, not a data
// contract, so it doesn't belong in packages/shared.
//
// Falls back to the member's first name whenever FATHER/MOTHER can't be
// used unambiguously: the userId isn't found, their role is the neutral
// PARENT, or another family member shares the same FATHER/MOTHER role (two
// dads, two moms, or a mixed household where roles don't map 1:1 to "the
// two custody parents").
function findMember(members: ChildFamilyMember[], userId: string): ChildFamilyMember | undefined {
  return members.find((m) => m.userId === userId);
}

function roleIsUnambiguous(members: ChildFamilyMember[], role: ParentRole, userId: string): boolean {
  return members.filter((m) => m.parentRole === role).every((m) => m.userId === userId);
}

export function resolveParentTimeLabel(members: ChildFamilyMember[], userId: string | null): string {
  if (!userId) return "Unassigned";
  const member = findMember(members, userId);
  if (!member) return "Unassigned";
  const role = member.parentRole;
  if (role === "FATHER" && roleIsUnambiguous(members, "FATHER", userId)) return "Dad's Time";
  if (role === "MOTHER" && roleIsUnambiguous(members, "MOTHER", userId)) return "Mom's Time";
  return `${member.firstName}'s Time`;
}

export function resolveParentShortLabel(members: ChildFamilyMember[], userId: string | null): string {
  if (!userId) return "Unassigned";
  const member = findMember(members, userId);
  if (!member) return "Unassigned";
  const role = member.parentRole;
  if (role === "FATHER" && roleIsUnambiguous(members, "FATHER", userId)) return "Dad";
  if (role === "MOTHER" && roleIsUnambiguous(members, "MOTHER", userId)) return "Mom";
  return member.firstName;
}
