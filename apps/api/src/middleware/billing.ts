import type { NextFunction, Request, Response } from "express";

import { prisma } from "../db";
import { ApiError } from "./errorHandler";

// A subscription only actually grants its paid tier's benefits once payment
// has gone through — status ACTIVE (charged) or TRIALING (still in the free
// trial window). PENDING (checkout started but not confirmed), PAST_DUE, and
// CANCELED must NOT unlock paid-tier benefits, no matter what `tier` says:
// otherwise starting a Family checkout and abandoning it before paying
// leaves tier:FAMILY, status:PENDING forever, granting unlimited children
// for free. Both requireActiveAccess below and the child-creation cap check
// in routes/children/index.ts must gate on this, not on raw `tier`.
export function effectiveTier(subscription: { tier: string; status: string } | null): "FREE" | "PARENTS" | "FAMILY" {
  if (!subscription) return "FREE";
  if (subscription.status === "ACTIVE" || subscription.status === "TRIALING") {
    return subscription.tier as "FREE" | "PARENTS" | "FAMILY";
  }
  return "FREE";
}

// No longer mounted anywhere (D3 fix, roles/subscription spec §4.1 — see
// routes/children/index.ts) — the finalized Free tier is fully usable, so
// there is nothing left for a per-user trial-expiry gate to correctly
// block. Left in place, unreferenced, only because Phase 7 of the
// roles/subscription build order explicitly replaces this with
// `requireChildEntitlement(childId)` (a real per-child paid-tier gate);
// delete this function once that lands rather than resurrecting it.
export async function requireActiveAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;
    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }
    const subscription = await prisma.subscription.findUnique({ where: { ownerId: userId } });
    if (
      subscription &&
      effectiveTier(subscription) === "FREE" &&
      subscription.trialEndsAt &&
      subscription.trialEndsAt.getTime() < Date.now()
    ) {
      throw new ApiError(
        403,
        "Your 30-day trial has ended. Ask whoever invited you to keep their subscription active, or upgrade your own account, to keep editing."
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
