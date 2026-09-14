import type { NextFunction, Request, Response } from "express";
import { isSatisfied, satisfyingOwnerIds, type ChildMember, type OwnerEntitlementData } from "@kidcom/shared";

import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";

// spec 9.12 — shortened from the original 14-day proposal. A PAST_DUE
// subscription still counts at its pre-failure tier for this long before
// entitlement actually drops it.
export const GRACE_PERIOD_DAYS = 7;

function withinGracePeriod(pastDueSince: Date | null, now: Date): boolean {
  if (!pastDueSince) return false;
  return now.getTime() - pastDueSince.getTime() < GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}

// Fetches everything packages/shared/src/entitlement.ts's pure functions
// need for one child: every member's role (for requiredTier) and, for the
// PARENT/GUARDIAN ones specifically, their own subscription + trial fields
// (for effectiveCoverageTier). One query per table, not N+1. A PAST_DUE
// subscription still within its 7-day grace window (spec 9.12) is passed
// through as ACTIVE here — the pure function itself stays simple/unaware of
// grace periods; this is the one place that timing math happens.
async function loadChildEntitlementInputs(
  childId: string,
  now: Date = new Date()
): Promise<{
  members: ChildMember[];
  ownerData: Record<string, OwnerEntitlementData>;
}> {
  const access = await prisma.childAccess.findMany({
    where: { childId },
    select: { userId: true, role: true },
  });
  const members: ChildMember[] = access.map((a) => ({ userId: a.userId, role: a.role }));

  const coverers = access.filter((a) => a.role === "PARENT" || a.role === "GUARDIAN");
  const coverIds = coverers.map((c) => c.userId);
  const [subscriptions, users] = await Promise.all([
    prisma.subscription.findMany({ where: { ownerId: { in: coverIds } } }),
    prisma.user.findMany({ where: { id: { in: coverIds } }, select: { id: true, trialEndsAt: true } }),
  ]);
  const subByOwner = new Map(subscriptions.map((s) => [s.ownerId, s]));
  const trialByOwner = new Map(users.map((u) => [u.id, u.trialEndsAt]));

  const ownerData: Record<string, OwnerEntitlementData> = {};
  for (const id of coverIds) {
    const sub = subByOwner.get(id);
    let status = sub?.status;
    if (sub && status === "PAST_DUE" && withinGracePeriod(sub.pastDueSince, now)) {
      status = "ACTIVE";
    }
    ownerData[id] = {
      subscription: sub ? { tier: sub.tier, status: status! } : null,
      trialEndsAt: trialByOwner.get(id) ?? null,
    };
  }

  return { members, ownerData };
}

export async function isChildSatisfied(childId: string, now: Date = new Date()): Promise<boolean> {
  const { members, ownerData } = await loadChildEntitlementInputs(childId, now);
  return isSatisfied(members, ownerData, now);
}

// spec §4.2 pt.4 — every PARENT-role member whose own coverage currently
// satisfies the child: candidates to see a "take over this subscription"
// offer once someone else's coverage is about to lapse (childInGraceWindow
// below is what actually signals "about to," not just "already gone").
export async function childSatisfyingParentIds(childId: string, now: Date = new Date()): Promise<string[]> {
  const { members, ownerData } = await loadChildEntitlementInputs(childId, now);
  const satisfyingIds = new Set(satisfyingOwnerIds(members, ownerData, now));
  return members.filter((m) => m.role === "PARENT" && satisfyingIds.has(m.userId)).map((m) => m.userId);
}

// spec §4.2 pt.4 — true while the child is *currently* satisfied only
// because a covering subscription is inside its grace window (i.e. it's
// about to become unsatisfied unless someone takes over or the payment
// recovers). This is the "before it becomes unsatisfied, not after" signal
// the take-over offer is keyed on.
export async function childInGraceWindow(childId: string, now: Date = new Date()): Promise<boolean> {
  const { members, ownerData } = await loadChildEntitlementInputs(childId, now);
  const satisfiedNormally = isSatisfied(members, ownerData, now);
  if (!satisfiedNormally) return false;

  // Re-check with every grace-covered PAST_DUE subscription forced back to
  // its real (non-graced) status — if that flips the result to
  // unsatisfied, the current "satisfied" state is only grace-period-borrowed.
  const access = await prisma.childAccess.findMany({ where: { childId }, select: { userId: true, role: true } });
  const coverIds = access.filter((a) => a.role === "PARENT" || a.role === "GUARDIAN").map((a) => a.userId);
  const subs = await prisma.subscription.findMany({ where: { ownerId: { in: coverIds } } });
  const anyGraced = subs.some((s) => s.status === "PAST_DUE" && withinGracePeriod(s.pastDueSince, now));
  if (!anyGraced) return false;

  const ownerDataNoGrace: Record<string, OwnerEntitlementData> = { ...ownerData };
  for (const s of subs) {
    if (s.status === "PAST_DUE" && withinGracePeriod(s.pastDueSince, now) && ownerDataNoGrace[s.ownerId]) {
      ownerDataNoGrace[s.ownerId] = { ...ownerDataNoGrace[s.ownerId], subscription: { tier: s.tier, status: "PAST_DUE" } };
    }
  }
  return !isSatisfied(members, ownerDataNoGrace, now);
}

const PENDING_PARENT_LOCK_DAYS = 30;

// spec 9.8 — "at least one parent must be invited" is enforced narrowly: not
// by blocking anything else (the child stays fully usable — journal, media,
// everything §1.4 grants), only by locking the custody plan once a child
// has gone 30 days with *exactly one* PARENT-role member and no second one
// ever having joined. The point is specifically to stop one parent
// unilaterally cementing a schedule the other home never agreed to — not a
// general engagement nag, so nothing here fires once a 2nd parent exists,
// even if they joined on day 45. Deliberately does NOT fire for zero
// parents either (spec §2.2b, Phase 9) — a bootstrap-guardian child (a
// grandmother created it, no parent has ever joined) has no second home's
// schedule being overridden, since no parent has weighed in at all; her
// custody-plan access stays exactly what §1.4 grants GUARDIAN,
// unconditional. Fully derived from existing data (Child.createdAt + a role
// count) — no new schema needed.
export async function isCustodyPlanLockedPendingParent(childId: string): Promise<boolean> {
  return (await getCustodyPlanLockStatus(childId)).locked;
}

// Post-launch backlog Phase D — the data behind the persistent banner spec
// 9.8 asked for ("the real custody scheduler needs a second parent to mean
// anything") but was never built; until now the lock was only discoverable
// reactively, after a failed save. Same underlying query as
// isCustodyPlanLockedPendingParent above (which now just calls this),
// exposed with a day-count so the frontend can nudge before the lock hits,
// not just report it after. `daysUntilLocked` is null whenever the lock
// condition doesn't apply at all (0 or 2+ parents) — there's no countdown
// to show in that case, not "0 days."
export async function getCustodyPlanLockStatus(
  childId: string
): Promise<{ locked: boolean; daysUntilLocked: number | null }> {
  const [child, parentCount] = await Promise.all([
    prisma.child.findUnique({ where: { id: childId }, select: { createdAt: true } }),
    prisma.childAccess.count({ where: { childId, role: "PARENT" } }),
  ]);
  if (!child || parentCount !== 1) return { locked: false, daysUntilLocked: null };

  const lockThresholdMs = PENDING_PARENT_LOCK_DAYS * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - child.createdAt.getTime();
  if (ageMs > lockThresholdMs) return { locked: true, daysUntilLocked: 0 };
  return { locked: false, daysUntilLocked: Math.ceil((lockThresholdMs - ageMs) / (24 * 60 * 60 * 1000)) };
}

// Replaces the old per-user requireActiveAccess (removed in Phase 2/D3) —
// this is Phase 7/8's real per-child paid-tier gate: spec §2.2a's T1/T2/T3
// triggers (2nd child, 2nd parent, extended family) all cash out here, at
// whatever child-scoped mutation someone tries next. GETs are never gated
// (reads never gate on billing — preserved as-built property, load-bearing
// for §4.2's safety floor). Must run after requireChildAccess (needs
// req.params.childId; does not need req.childAccess itself).
//
// Does NOT implement the §4.2 safety floor itself — custody-plan.ts's PUT
// handler deliberately does NOT mount this middleware at all, and instead
// does its own PARENT-role-aware check inline (see that file's comment for
// why "custody-calendar writes" maps to exactly that one route in this
// codebase's architecture).
export async function requireChildEntitlement(req: Request, _res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }
  try {
    const childId = req.params.childId;
    if (!childId) {
      throw new ApiError(400, "childId param is required");
    }
    const satisfied = await isChildSatisfied(childId);
    if (!satisfied) {
      throw new ApiError(
        403,
        "This child's circle needs a paid plan to keep editing — upgrade to keep everyone's access active."
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
