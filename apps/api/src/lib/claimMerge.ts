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

// Moves every OTHER member's ChildAccess from the duplicate record onto the
// real one (the accepting user already has their own access to the real
// child — nothing to move for them), then deletes the duplicate. Auto-merge,
// no confirmation step: once a match is found, keeping two records for the
// same human is never the right outcome, so there's no real choice to offer.
//
// Scope limitation, flagged not silently assumed complete: this merges
// ACCESS only. Content authored on the duplicate before the claim happens
// (journal posts, photos, medical info, growth entries, a custody plan) is
// NOT migrated — it's deleted along with the duplicate record (Prisma's
// onDelete: Cascade relations). This is safe for the realistic timing this
// flow is built for (a claim-link is meant to be caught quickly, before any
// real content accumulates on the bootstrap record) but would lose data for
// a duplicate that's been in active use for a while. A full content
// migration across every child-scoped table is out of scope for this phase.
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
  await tx.child.delete({ where: { id: duplicateChildId } });
}
