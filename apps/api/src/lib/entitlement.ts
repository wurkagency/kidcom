import type { NextFunction, Request, Response } from "express";
import type { TierFeature } from "@kidcom/shared";
import { tierForFeature, tierHasFeature } from "@kidcom/shared";

import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";
import { childTier } from "./circles";

const PENDING_PARENT_LOCK_DAYS = 30;

// spec 9.8 — "at least one parent must be invited" is enforced narrowly: not
// by blocking anything else (the child stays fully usable — moments, media,
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

/**
 * Subscription model rule 1: a child's features come from its Circle's tier.
 * Gates a child-scoped route (reads too: a feature gate hides the feature,
 * never the data, so it all comes back after an upgrade). Must run after
 * requireChildAccess.
 */
export function requireTierFeature(feature: TierFeature) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const childId = req.params.childId;
      if (!childId) throw new ApiError(400, "childId param is required");
      const tier = await childTier(childId);
      if (!tierHasFeature(tier, feature)) {
        const requiredTier = tierForFeature(feature);
        throw new ApiError(403, "This needs a Parent or Family Circle", "PLAN_REQUIRED", { feature, requiredTier });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
