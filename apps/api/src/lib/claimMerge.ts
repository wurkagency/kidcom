import { prisma } from "../db";

// spec 9.9 — "when an invitee already has a matching child (name +
// birthday), offer to link to your existing Emma instead of creating a
// second record." Match is name (case-insensitive) + birthday, scoped to
// children the *accepting* user already holds PARENT-role access to (their
// own, real child) — never a FAMILY/GUARDIAN grant elsewhere, which
// wouldn't mean "this is actually my child."
export async function findClaimableChild(userId: string, candidateChildId: string): Promise<string | null> {
  const candidate = await prisma.child.findUnique({ where: { id: candidateChildId } });
  if (!candidate) return null;
  const match = await prisma.child.findFirst({
    where: {
      id: { not: candidateChildId },
      firstName: { equals: candidate.firstName, mode: "insensitive" },
      birthday: candidate.birthday,
      access: { some: { userId, role: "PARENT" } },
    },
  });
  return match?.id ?? null;
}

// Every child-scoped model whose content should survive a merge, reassigned
// onto the real child before the duplicate is deleted rather than lost to
// cascade delete (post-launch backlog Phase A — this function used to move
// ChildAccess only, flagged in its own comment as a scope limit). Deliberately
// NOT included:
//   - `childScheduleOccurrence` — has `@@unique([childId, templateId,
//     sequence])`; both children very plausibly already generated the same
//     country-default template's occurrence (the medical schedule is lazily
//     seeded per child on first load), so a blind reassign risks a unique-
//     constraint collision. This is auto-regenerated progress-tracking state,
//     not user-authored content, so it's simpler and safer to just let it
//     cascade-delete with the duplicate — the target's own schedule page
//     regenerates whatever's missing next time it loads.
//   - `childDeletionRequest` — a pending deletion vote on a record that's
//     about to be deleted is moot; let it cascade-delete too.
const CHILD_SCOPED_MODELS_TO_MIGRATE = [
  "journalPostChild",
  "medicalInfo",
  "growthEntry",
  "emergencyContact",
  "custodyPlan",
  "calendarEvent",
  "calendarEventRequest",
  "swapRequest",
  "listItem",
  "upgradeRequest",
] as const;

// Moves every OTHER member's ChildAccess, plus all real content (journal
// posts via the join table, medical info, growth entries, emergency
// contacts, custody plans, calendar events, swap requests, lists, upgrade
// requests), from the duplicate record onto the real one, then deletes the
// duplicate. Auto-merge, no confirmation step: once a match is found,
// keeping two records for the same human is never the right outcome, so
// there's no real choice to offer.
//
// `tx` is a Prisma transaction client, typed loosely (`any`) to match this
// codebase's existing convention for transaction-callback params elsewhere
// (see e.g. listItems.ts's setListItemImage).
export async function mergeChildAccessInto(
  tx: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  duplicateChildId: string,
  targetChildId: string,
  exceptUserId: string
): Promise<void> {
  const duplicateAccess = await tx.childAccess.findMany({ where: { childId: duplicateChildId } });
  for (const a of duplicateAccess) {
    if (a.userId === exceptUserId) continue;
    await tx.childAccess.upsert({
      where: { childId_userId: { childId: targetChildId, userId: a.userId } },
      update: {},
      create: {
        childId: targetChildId,
        userId: a.userId,
        role: a.role,
        relationship: a.relationship,
        medicalInfoAccess: a.medicalInfoAccess,
      },
    });
  }

  for (const model of CHILD_SCOPED_MODELS_TO_MIGRATE) {
    await tx[model].updateMany({ where: { childId: duplicateChildId }, data: { childId: targetChildId } });
  }

  // MediaAsset.avatarForChildId is a @unique FK to Child with no onDelete
  // clause — left pointing at the duplicate, `tx.child.delete()` below would
  // throw a foreign-key-constraint error. Clear it rather than move it onto
  // the target: the target keeps whatever avatar it already has (or none) —
  // importing the duplicate's own identity photo isn't what merging access
  // means, and the target more likely already has its own correct one.
  await tx.mediaAsset.updateMany({ where: { avatarForChildId: duplicateChildId }, data: { avatarForChildId: null } });

  await tx.child.delete({ where: { id: duplicateChildId } });
}
