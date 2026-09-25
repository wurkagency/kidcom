import type { AccessRole, BillingPeriod, SubscriptionTier } from "./index";

// The subscription model's single source of truth (tasks/subscription_model
// plan, §2 "One source of truth"): limits, features, invitable roles and
// prices per tier. The API enforces these on every write; the app reads the
// same values for paywalls and greyed-out tiers.
//
// FREE is "Single": free, no Circle, no invites. PARENTS and FAMILY are
// Circles, owned by the person who pays.

export type TierFeature =
  /** Custody schedules and swap requests. */
  | "custodyPlanning"
  /** The Media Library (gallery, downloads). Originals are stored on every tier. */
  | "mediaLibrary"
  /** Inviting other parents into the Circle (Family only, rule 3). */
  | "circleMembers";

export type TierLimits = {
  /** Children in the Circle (or on a parent's Single). */
  children: number;
  /** A user's storage consumption limit (§5: per user, by access). */
  storageBytes: number;
  /** Roles a parent may invite to a child under this tier (D1, D2). */
  invitableRoles: AccessRole[];
  features: TierFeature[];
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const TIERS: Record<SubscriptionTier, TierLimits> = {
  FREE: { children: 2, storageBytes: 500 * MB, invitableRoles: [], features: [] },
  PARENTS: {
    children: 3,
    storageBytes: 1 * GB,
    invitableRoles: ["PARENT", "GUARDIAN"],
    features: ["custodyPlanning", "mediaLibrary"],
  },
  FAMILY: {
    children: 6,
    storageBytes: 100 * GB,
    invitableRoles: ["PARENT", "GUARDIAN", "FAMILY"],
    features: ["custodyPlanning", "mediaLibrary", "circleMembers"],
  },
};

export type PaidTier = Exclude<SubscriptionTier, "FREE">;

/** Øre, VAT included. Yearly is 25% off twelve months (D7): 12 × 39 × 0.75 = 351. */
export const TIER_PRICES_ORE: Record<PaidTier, Record<BillingPeriod, number>> = {
  PARENTS: { MONTHLY: 3900, ANNUAL: 35100 },
  FAMILY: { MONTHLY: 6900, ANNUAL: 62100 },
};

export const TIER_ORDER: SubscriptionTier[] = ["FREE", "PARENTS", "FAMILY"];

export const TRIAL_DAYS = 30;
/** Usage bar warning (§5). */
export const STORAGE_WARN_RATIO = 0.8;
/** New uploads are refused from here until the plan is upgraded (§5). */
export const STORAGE_BLOCK_RATIO = 0.9;
/** Abuse guard: most a single user can upload in 24 hours (§5). */
export const DAILY_UPLOAD_CAP_BYTES = 2 * GB;
/** D5: a suspended child is hidden for 30 days, then deleted on day 90. */
export const SUSPENSION_DELETE_DAYS = 90;
export const SUSPENSION_NOTICE_DAYS = [0, 30, 83] as const;

export function tierAtLeast(tier: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(required);
}

export function tierHasFeature(tier: SubscriptionTier, feature: TierFeature): boolean {
  return TIERS[tier].features.includes(feature);
}

/** The lowest tier that includes `feature`. */
export function tierForFeature(feature: TierFeature): SubscriptionTier {
  return TIER_ORDER.find((t) => tierHasFeature(t, feature)) ?? "FAMILY";
}

/** The lowest tier under which a parent may invite someone with `role` (D1, D2, D10). */
export function tierForRole(role: AccessRole): SubscriptionTier {
  return TIER_ORDER.find((t) => TIERS[t].invitableRoles.includes(role)) ?? "FAMILY";
}

/**
 * Why a tier can't hold what's in use (§2 downgrade rule, D12): too many
 * children, invited roles it doesn't allow, parent members, storage over its
 * limit, or a feature in use that it doesn't include.
 */
export type TierBlockReason =
  | { code: "CHILDREN"; count: number; limit: number }
  | { code: "ROLE"; role: AccessRole; count: number }
  | { code: "CIRCLE_MEMBERS"; count: number }
  | { code: "STORAGE"; usedBytes: number; limitBytes: number }
  | { code: "FEATURE"; feature: TierFeature };

/** What a Circle (or a Single) currently uses, for fit checks against a tier. */
export type TierUsage = {
  children: number;
  /** Invited people per role (the owner's own parent/guardian rows excluded). */
  invitedRoles: Partial<Record<AccessRole, number>>;
  circleMembers: number;
  storageBytes: number;
  featuresInUse: TierFeature[];
};

export function tierBlockReasons(tier: SubscriptionTier, usage: TierUsage): TierBlockReason[] {
  const limits = TIERS[tier];
  const reasons: TierBlockReason[] = [];
  if (usage.children > limits.children) reasons.push({ code: "CHILDREN", count: usage.children, limit: limits.children });
  for (const [role, count] of Object.entries(usage.invitedRoles) as [AccessRole, number][]) {
    if (count > 0 && !limits.invitableRoles.includes(role)) reasons.push({ code: "ROLE", role, count });
  }
  if (usage.circleMembers > 0 && !tierHasFeature(tier, "circleMembers")) {
    reasons.push({ code: "CIRCLE_MEMBERS", count: usage.circleMembers });
  }
  if (usage.storageBytes > limits.storageBytes) {
    reasons.push({ code: "STORAGE", usedBytes: usage.storageBytes, limitBytes: limits.storageBytes });
  }
  for (const feature of usage.featuresInUse) {
    if (!tierHasFeature(tier, feature)) reasons.push({ code: "FEATURE", feature });
  }
  return reasons;
}
