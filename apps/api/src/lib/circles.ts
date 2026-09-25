import type { Prisma, Subscription } from "@kinnd/db";
import type { AccessRole, SubscriptionTier, TierBlockReason, TierFeature, TierUsage } from "@kinnd/shared";
import { TIERS, TIER_ORDER, tierAtLeast, tierBlockReasons } from "@kinnd/shared";

import { prisma } from "../db";
import { withRlsBypass } from "./rls";

// Subscription model §2: a PARENTS/FAMILY Subscription row is a Circle,
// owned by the person who pays. Single (FREE) has no Circle. This module
// answers "what tier applies" for people and children, and what a Circle
// currently uses (for downgrade blocking and the D5 "fits Single" check).

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A Circle counts while paid for, in trial, on a lifetime coupon, or
 * cancelled but still inside the period already paid for.
 */
export function isCircleActive(
  sub: Pick<Subscription, "tier" | "status"> & { currentPeriodEnd?: Date | null } | null | undefined,
  now = new Date()
): boolean {
  if (!sub || sub.tier === "FREE") return false;
  if (sub.status === "ACTIVE" || sub.status === "TRIALING") return true;
  return sub.status === "CANCELED" && !!sub.currentPeriodEnd && sub.currentPeriodEnd > now;
}

export type HeldCircle = { circle: Subscription; role: "OWNER" | "MEMBER" };

/**
 * The Circles a user holds: the one they own (D9: at most one) and the one
 * they're a parent member of (rule 3). Inactive Circles are left out.
 */
export async function heldCircles(userId: string, db: Db = prisma): Promise<HeldCircle[]> {
  const [owned, membership] = await Promise.all([
    db.subscription.findUnique({ where: { ownerId: userId } }),
    db.circleMember.findUnique({ where: { userId }, include: { circle: true } }),
  ]);
  const held: HeldCircle[] = [];
  if (isCircleActive(owned)) held.push({ circle: owned!, role: "OWNER" });
  if (membership && isCircleActive(membership.circle)) held.push({ circle: membership.circle, role: "MEMBER" });
  return held;
}

function maxTier(tiers: SubscriptionTier[]): SubscriptionTier {
  return tiers.reduce<SubscriptionTier>((best, t) => (tierAtLeast(t, best) ? t : best), "FREE");
}

/** The tier a user holds: their own Circle's, a Circle they're a member of, or FREE (Single). */
export async function heldTier(userId: string, db: Db = prisma): Promise<SubscriptionTier> {
  return maxTier((await heldCircles(userId, db)).map((h) => h.circle.tier));
}

/** The Circle a user adds new children to: their own, else the one they're a member of. */
export async function primaryCircle(userId: string, db: Db = prisma): Promise<HeldCircle | null> {
  const held = await heldCircles(userId, db);
  return held.find((h) => h.role === "OWNER") ?? held[0] ?? null;
}

/** The tier that sets a child's features (rule 1): its Circle's, or FREE. */
export async function childTier(childId: string, db: Db = prisma): Promise<SubscriptionTier> {
  const child = await db.child.findUnique({ where: { id: childId }, select: { circle: true } });
  return isCircleActive(child?.circle) ? child!.circle!.tier : "FREE";
}

/** Children tiers in one query, for list endpoints. */
export async function childTiers(childIds: string[], db: Db = prisma): Promise<Map<string, SubscriptionTier>> {
  const rows = await db.child.findMany({ where: { id: { in: childIds } }, select: { id: true, circle: true } });
  return new Map(rows.map((r) => [r.id, isCircleActive(r.circle) ? r.circle!.tier : "FREE"]));
}

/**
 * Storage consumption (§5, D6): the total original size of every media
 * asset the user can access, each counted once for that user: their own
 * uploads, media on moments tagged to children they can see, those
 * children's avatars, covers and list photos, and message attachments in
 * their threads. Media held by an active alarm is left out (it's not
 * accessible in the app).
 */
export async function consumptionBytes(userId: string): Promise<number> {
  const rows = await withRlsBypass(
    (tx) => tx.$queryRaw<{ total: bigint | null }[]>`
      WITH my_children AS (
        SELECT "childId" FROM "child_access" WHERE "userId" = ${userId}
      ),
      accessible AS (
        SELECT m."id" FROM "media_assets" m WHERE m."ownerId" = ${userId}
        UNION
        SELECT m."id" FROM "media_assets" m
          JOIN "journal_post_children" pc ON pc."journalPostId" = m."journalPostId"
          WHERE pc."childId" IN (SELECT "childId" FROM my_children)
        UNION
        SELECT m."id" FROM "media_assets" m
          WHERE m."avatarForChildId" IN (SELECT "childId" FROM my_children)
             OR m."coverForChildId" IN (SELECT "childId" FROM my_children)
        UNION
        SELECT m."id" FROM "media_assets" m
          JOIN "list_items" li ON li."id" = m."listItemImageForId"
          WHERE li."childId" IN (SELECT "childId" FROM my_children)
        UNION
        SELECT msg."mediaId" FROM "messages" msg
          JOIN "thread_members" tm ON tm."threadId" = msg."threadId"
          WHERE tm."userId" = ${userId} AND msg."mediaId" IS NOT NULL
      )
      SELECT SUM(COALESCE(m."originalBytes", 0))::bigint AS total
      FROM "media_assets" m
      WHERE m."id" IN (SELECT "id" FROM accessible)
        AND NOT EXISTS (SELECT 1 FROM "alarms" a WHERE a."mediaAssetId" = m."id" AND a."status" = 'ACTIVE')`
  );
  return Number(rows[0]?.total ?? 0);
}

/** Bytes the user uploaded in the last 24 hours (the daily abuse cap, §5). */
export async function uploadedLastDayBytes(userId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const agg = await withRlsBypass((tx) =>
    tx.mediaAsset.aggregate({ where: { ownerId: userId, createdAt: { gte: since } }, _sum: { originalBytes: true } })
  );
  return agg._sum.originalBytes ?? 0;
}

/**
 * What a Circle uses, for fit checks against a lower tier (§2 downgrade
 * rule, D12 "used = data that exists"):
 *  - children in the Circle;
 *  - invited people by role: everyone on the Circle's children who isn't the
 *    owner or a parent member, plus family granted through this Circle on
 *    other children (D10);
 *  - parent members;
 *  - the owner's storage consumption;
 *  - custody planning, once a custody plan exists for one of its children.
 */
export async function circleUsage(circle: Pick<Subscription, "id" | "ownerId">): Promise<TierUsage> {
  const [children, members] = await Promise.all([
    prisma.child.findMany({ where: { circleId: circle.id, deletedAt: null }, select: { id: true } }),
    prisma.circleMember.findMany({ where: { circleId: circle.id }, select: { userId: true } }),
  ]);
  const childIds = children.map((c) => c.id);
  const own = new Set([circle.ownerId, ...members.map((m) => m.userId)]);

  const access = await prisma.childAccess.findMany({
    where: { OR: [{ childId: { in: childIds } }, { grantedViaCircleId: circle.id }] },
    select: { userId: true, role: true, childId: true },
  });
  const invitedRoles: Partial<Record<AccessRole, number>> = {};
  const seen = new Set<string>();
  for (const a of access) {
    if (own.has(a.userId)) continue;
    const key = `${a.userId}:${a.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    invitedRoles[a.role] = (invitedRoles[a.role] ?? 0) + 1;
  }

  const custodyPlans = childIds.length
    ? await withRlsBypass((tx) => tx.custodyPlan.count({ where: { childId: { in: childIds } } }))
    : 0;
  const featuresInUse: TierFeature[] = custodyPlans > 0 ? ["custodyPlanning"] : [];

  return {
    children: childIds.length,
    invitedRoles,
    circleMembers: members.length,
    storageBytes: await consumptionBytes(circle.ownerId),
    featuresInUse,
  };
}

/** Usage of a user without a Circle: their own children on Single and their storage. */
export async function singleUsage(userId: string): Promise<TierUsage> {
  const children = await prisma.childAccess.count({
    where: { userId, role: { in: ["PARENT", "GUARDIAN"] }, child: { circleId: null, deletedAt: null } },
  });
  return { children, invitedRoles: {}, circleMembers: 0, storageBytes: await consumptionBytes(userId), featuresInUse: [] };
}

/** Every tier, with whether the usage fits it. */
export function tierAvailability(usage: TierUsage): { tier: SubscriptionTier; available: boolean; reasons: TierBlockReason[] }[] {
  return TIER_ORDER.map((tier) => {
    const reasons = tierBlockReasons(tier, usage);
    return { tier, available: reasons.length === 0, reasons };
  });
}

/** Children a user can add under the tier they hold (rule 1). */
export async function childCapacity(userId: string): Promise<{ used: number; limit: number; circleId: string | null }> {
  const primary = await primaryCircle(userId);
  if (primary) {
    const used = await prisma.child.count({ where: { circleId: primary.circle.id, deletedAt: null } });
    return { used, limit: TIERS[primary.circle.tier].children, circleId: primary.circle.id };
  }
  const usage = await singleUsage(userId);
  return { used: usage.children, limit: TIERS.FREE.children, circleId: null };
}
