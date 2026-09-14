import type { AccessRole, SubscriptionStatus, SubscriptionTier } from "./index";

// spec §2.2 — the entitlement model. Pure functions, no DB: apps/api's
// lib/entitlement.ts does the Prisma fetching and calls these; the web app
// can import them too (e.g. to preview "this will require Family" before an
// invite is even sent — spec §2.3's paywall-resolves-before-the-invite UX),
// since none of this needs a server round trip once the inputs are in hand.

const TIER_RANK: Record<SubscriptionTier, number> = { FREE: 0, PARENTS: 1, FAMILY: 2 };

export function tierAtLeast(tier: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[required];
}

export type ChildMember = { userId: string; role: AccessRole };

// def. 3 (spec §2.2) — required tier is evaluated *per candidate coverer*,
// not as one global value: the 9.18 carve-out ("a GUARDIAN-role member
// other than the covering subscription's own owner") means a lone guardian
// covering her own child on her own plan doesn't trigger the FAMILY tier
// for herself, but the same child's requiredTier is FAMILY from anyone
// else's perspective. `candidateOwnerId` is whichever member's subscription
// is being asked "would you satisfy this child" — see isSatisfied below,
// which is the only place that matters in practice.
export function requiredTier(members: ChildMember[], candidateOwnerId: string): SubscriptionTier {
  const hasFamily = members.some((m) => m.role === "FAMILY");
  const hasOtherGuardian = members.some((m) => m.role === "GUARDIAN" && m.userId !== candidateOwnerId);
  if (hasFamily || hasOtherGuardian) return "FAMILY";
  if (members.length >= 2) return "PARENTS";
  return "FREE";
}

export type OwnerEntitlementData = {
  subscription: { tier: SubscriptionTier; status: SubscriptionStatus } | null;
  // I-2 (spec §2.2/§4.3) — null if this user has never had a trial.
  trialEndsAt: Date | null;
};

// While within their own one-time trial window, a user's coverage tier is
// treated as the max (FAMILY) regardless of their actual Subscription.tier/
// status — the trial "covers every child the user can reach during the
// window" (I-2), independent of whatever their subscription is doing.
// Otherwise, coverage requires the subscription to actually be
// ACTIVE/TRIALING (PENDING/PAST_DUE/CANCELED never count, matching the
// as-built effectiveTier property this preserves) and uses its real tier.
export function effectiveCoverageTier(now: Date, data: OwnerEntitlementData): SubscriptionTier {
  if (data.trialEndsAt && data.trialEndsAt.getTime() > now.getTime()) {
    return "FAMILY";
  }
  if (data.subscription && (data.subscription.status === "ACTIVE" || data.subscription.status === "TRIALING")) {
    return data.subscription.tier;
  }
  return "FREE";
}

// def. 4 (spec §2.2) — a child is satisfied iff at least one PARENT/GUARDIAN
// member's own coverage (their trial, or their active/trialing subscription)
// meets or exceeds the tier *that same member's* coverage would need to
// satisfy (the 9.18-adjusted requiredTier from that member's perspective).
export function isSatisfied(members: ChildMember[], ownerData: Record<string, OwnerEntitlementData>, now: Date = new Date()): boolean {
  const coverers = members.filter((m) => m.role === "PARENT" || m.role === "GUARDIAN");
  return coverers.some((m) => {
    const data = ownerData[m.userId];
    if (!data) return false;
    const effTier = effectiveCoverageTier(now, data);
    return tierAtLeast(effTier, requiredTier(members, m.userId));
  });
}

// spec §2.2: which of a child's PARENT/GUARDIAN members currently satisfy
// it (i.e. would appear in a "take over this subscription" prompt, spec
// §4.2 pt.4 / Phase 8). Only role FAMILY never covers anything — Consequence
// 1, spec §2.2 — so FAMILY-role members are never candidates in the first
// place (filtered the same way isSatisfied does).
export function satisfyingOwnerIds(members: ChildMember[], ownerData: Record<string, OwnerEntitlementData>, now: Date = new Date()): string[] {
  const coverers = members.filter((m) => m.role === "PARENT" || m.role === "GUARDIAN");
  return coverers
    .filter((m) => {
      const data = ownerData[m.userId];
      if (!data) return false;
      const effTier = effectiveCoverageTier(now, data);
      return tierAtLeast(effTier, requiredTier(members, m.userId));
    })
    .map((m) => m.userId);
}
