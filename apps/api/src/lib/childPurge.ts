import { prisma } from "../db";
import { RESTORE_WINDOW_DAYS } from "../routes/children/deletion";

// Post-launch backlog Phase H — the real gap found while confirming what
// GDPR retention still needed: GET /auth/export and DELETE /auth/me
// already existed (verified by direct read), but Phase 10's soft-delete
// (Child.deletedAt, spec 9.21's 30-day restore window) had no follow-
// through — a soft-deleted child just stayed soft-deleted forever past 30
// days; nothing ever called the real hard delete. This is that job.
//
// Content on a purged child cascades via the same onDelete: Cascade
// relations every other Child.delete() call in this codebase already
// relies on (see claimMerge.ts) — no per-model cleanup needed here either.
export async function purgeExpiredDeletedChildren(now: Date = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.child.findMany({
    where: { deletedAt: { not: null, lte: cutoff } },
    select: { id: true },
  });

  for (const child of expired) {
    await prisma.child.delete({ where: { id: child.id } });
  }

  return { purged: expired.length };
}
