import type { Prisma, SuspensionReason } from "@kidcom/db";
import { SUSPENSION_DELETE_DAYS, TIERS, tierBlockReasons } from "@kidcom/shared";

import { prisma } from "../db";
import { ApiError } from "../middleware/errorHandler";
import { circleUsage, heldCircles, isCircleActive } from "./circles";
import { mailSender } from "./mailSender";
import { mediaStorage } from "./mediaStorage";
import { notify } from "./notify";
import { withRlsBypass } from "./rls";
import { config } from "../config";

// Subscription model §4 (D5): no payment, no child, but never without
// warning. A child's access rows are moved into suspended_child_access to
// hide it (every RLS policy keys off child_access), and moved back to
// restore it unchanged.

const DAY_MS = 24 * 60 * 60 * 1000;
type Tx = Prisma.TransactionClient;

async function suspendAccessRows(tx: Tx, where: Prisma.ChildAccessWhereInput, reason: SuspensionReason): Promise<number> {
  const rows = await tx.childAccess.findMany({ where });
  if (rows.length === 0) return 0;
  await tx.suspendedChildAccess.createMany({
    data: rows.map((r) => ({
      childId: r.childId,
      userId: r.userId,
      role: r.role,
      relationship: r.relationship,
      medicalInfoAccess: r.medicalInfoAccess,
      isMinorMember: r.isMinorMember,
      grantedViaCircleId: r.grantedViaCircleId,
      originalCreatedAt: r.createdAt,
      reason,
    })),
    skipDuplicates: true,
  });
  await tx.childAccess.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return rows.length;
}

async function restoreAccessRows(tx: Tx, where: Prisma.SuspendedChildAccessWhereInput): Promise<number> {
  const rows = await tx.suspendedChildAccess.findMany({ where });
  if (rows.length === 0) return 0;
  await tx.childAccess.createMany({
    data: rows.map((r) => ({
      childId: r.childId,
      userId: r.userId,
      role: r.role,
      relationship: r.relationship,
      medicalInfoAccess: r.medicalInfoAccess,
      isMinorMember: r.isMinorMember,
      grantedViaCircleId: r.grantedViaCircleId,
      createdAt: r.originalCreatedAt,
    })),
    skipDuplicates: true,
  });
  await tx.suspendedChildAccess.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return rows.length;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/** Parents and guardians of a child, from live or suspended access rows. */
async function parentIdsOf(childId: string): Promise<string[]> {
  const [live, suspended] = await Promise.all([
    prisma.childAccess.findMany({ where: { childId, role: { in: ["PARENT", "GUARDIAN"] } }, select: { userId: true } }),
    prisma.suspendedChildAccess.findMany({ where: { childId, role: { in: ["PARENT", "GUARDIAN"] } }, select: { userId: true } }),
  ]);
  return [...new Set([...live, ...suspended].map((r) => r.userId))];
}

/** Suspends a child: hidden for everyone, deleted on day 90 unless paid for or taken over. */
export async function suspendChild(childId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.child.update({
      where: { id: childId },
      data: {
        circleId: null,
        suspendedAt: now,
        deleteAfter: new Date(now.getTime() + SUSPENSION_DELETE_DAYS * DAY_MS),
        suspensionNotices: 0,
      },
    });
    await suspendAccessRows(tx, { childId }, "CHILD_SUSPENDED");
  });
  await sendSuspensionNotices(now, childId);
}

/** Restores a suspended child into a Circle: everyone's access comes back unchanged. */
async function restoreChildInto(tx: Tx, childId: string, circleId: string | null): Promise<void> {
  await tx.child.update({
    where: { id: childId },
    data: { circleId, suspendedAt: null, deleteAfter: null, suspensionNotices: 0 },
  });
  await restoreAccessRows(tx, { childId, reason: "CHILD_SUSPENDED" });
  // Family granted through a Circle that has since ended stays hidden (D10).
  const granted = await tx.childAccess.findMany({
    where: { childId, grantedViaCircleId: { not: null } },
    select: { id: true, grantedViaCircle: { select: { tier: true, status: true } } },
  });
  const lapsed = granted.filter((g) => !isCircleActive(g.grantedViaCircle)).map((g) => g.id);
  if (lapsed.length) await suspendAccessRows(tx, { id: { in: lapsed } }, "CIRCLE_ENDED");
}

/**
 * A Circle stops being paid for (declined charge, trial ended without a
 * card, cancellation). D5: if what it uses fits Single, it simply drops to
 * Single. Otherwise its children are suspended, and the other parents get
 * the take-over offer. Family granted through it on other children (D10)
 * loses access until it's active again.
 */
export async function endCircle(circleId: string, now = new Date()): Promise<{ droppedToSingle: boolean; suspended: string[] }> {
  const circle = await prisma.subscription.findUniqueOrThrow({ where: { id: circleId } });
  const usage = await circleUsage(circle);
  const fitsSingle = tierBlockReasons("FREE", usage).length === 0;
  const children = await prisma.child.findMany({ where: { circleId, deletedAt: null }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: circleId },
      data: {
        tier: "FREE",
        status: "ACTIVE",
        billingPeriod: null,
        currentPeriodEnd: null,
        quickpaySubscriptionId: null,
        pastDueSince: null,
        trialEndsAt: null,
        couponId: null,
      },
    });
    await tx.circleMember.deleteMany({ where: { circleId } });
    await tx.invite.deleteMany({ where: { circleId, acceptedAt: null } });
    await suspendAccessRows(tx, { grantedViaCircleId: circleId }, "CIRCLE_ENDED");
    if (fitsSingle) await tx.child.updateMany({ where: { circleId }, data: { circleId: null } });
  });

  if (fitsSingle) return { droppedToSingle: true, suspended: [] };
  for (const c of children) await suspendChild(c.id, now);
  return { droppedToSingle: false, suspended: children.map((c) => c.id) };
}

/** A Circle is paid for again: family granted through it gets access back (D10). */
export async function reactivateCircle(circleId: string): Promise<void> {
  await prisma.$transaction((tx) => restoreAccessRows(tx, { grantedViaCircleId: circleId, reason: "CIRCLE_ENDED" }));
}

/**
 * Take over (D4): a parent or guardian of the child moves it into a Circle
 * they own or are a parent member of, if it has room. Works for a suspended
 * child too (any parent can, without the other's consent, until deletion).
 */
export async function moveChildToCircle(childId: string, userId: string, circleId: string): Promise<void> {
  const [live, suspended] = await Promise.all([
    prisma.childAccess.findUnique({ where: { childId_userId: { childId, userId } } }),
    prisma.suspendedChildAccess.findUnique({ where: { childId_userId: { childId, userId } } }),
  ]);
  const role = live?.role ?? (suspended?.reason === "CHILD_SUSPENDED" ? suspended.role : null);
  if (role !== "PARENT" && role !== "GUARDIAN") {
    throw new ApiError(403, "Only the child's parent or guardian can move the child", "NOT_PARENT");
  }
  const target = (await heldCircles(userId)).find((h) => h.circle.id === circleId);
  if (!target) throw new ApiError(403, "You don't own or belong to that Circle", "NOT_YOUR_CIRCLE");

  const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
  if (child.deletedAt) throw new ApiError(404, "Child not found");
  if (child.circleId === circleId) return;
  const count = await prisma.child.count({ where: { circleId, deletedAt: null } });
  const limit = TIERS[target.circle.tier].children;
  if (count >= limit) {
    throw new ApiError(403, `That Circle is full (${limit} children)`, "CIRCLE_FULL", { limit });
  }

  await prisma.$transaction(async (tx) => {
    if (child.suspendedAt) await restoreChildInto(tx, childId, circleId);
    else await tx.child.update({ where: { id: childId }, data: { circleId } });
  });
}

/**
 * D5 warnings: day 0 (hidden, with the deletion date), day 30 (the 30 hidden
 * days are over) and day 83 (7 days left). Email and push to every parent
 * and guardian; the notices link into the app only, never to a download.
 */
export async function sendSuspensionNotices(now = new Date(), onlyChildId?: string): Promise<number> {
  const due = await prisma.child.findMany({
    where: { suspendedAt: { not: null }, deletedAt: null, ...(onlyChildId ? { id: onlyChildId } : {}) },
    select: { id: true, firstName: true, suspendedAt: true, deleteAfter: true, suspensionNotices: true },
  });
  let sent = 0;
  for (const child of due) {
    const day = Math.floor((now.getTime() - child.suspendedAt!.getTime()) / DAY_MS);
    const stage = day >= 83 ? 3 : day >= 30 ? 2 : 1;
    if (child.suspensionNotices >= stage) continue;

    const parents = await parentIdsOf(child.id);
    const deleteOn = fmtDate(child.deleteAfter!);
    const url = "/billing";
    await notify(parents, {
      kind: stage === 1 ? "child.suspended" : "child.deletion_warning",
      params: { child: child.firstName, date: deleteOn },
      url,
    });
    const users = await prisma.user.findMany({ where: { id: { in: parents }, deletedAt: null }, select: { email: true } });
    const subject =
      stage === 1 ? `${child.firstName} is hidden until someone pays` : `${child.firstName}'s data will be deleted on ${deleteOn}`;
    const text =
      (stage === 1
        ? `Nobody pays for ${child.firstName}'s plan any more, so ${child.firstName} is hidden in KidCom for everyone.`
        : `${child.firstName} has been hidden since ${fmtDate(child.suspendedAt!)}.`) +
      `\n\nOn ${deleteOn}, ${child.firstName}'s entries and media are deleted, unless someone pays or takes ${child.firstName} over into their own plan.` +
      `\n\nOpen KidCom to pay, take over, or download your data: ${config.webBaseUrl}${url}`;
    for (const u of users) {
      try {
        await mailSender.send({ to: u.email, subject, text });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Suspension notice for child ${child.id} failed:`, err);
      }
    }
    await prisma.child.update({ where: { id: child.id }, data: { suspensionNotices: stage } });
    sent++;
  }
  return sent;
}

async function activeAlarmMediaIds(): Promise<Set<string>> {
  const alarms = await prisma.alarm.findMany({ where: { status: "ACTIVE", mediaAssetId: { not: null } }, select: { mediaAssetId: true } });
  return new Set(alarms.map((a) => a.mediaAssetId!));
}

/**
 * Day 90 (D5): deletes a suspended child's entries and media. The child's
 * own moments (tagged to no other child) go with it, their media files
 * too. Nothing held by an active alarm is deleted: a child with an active
 * alarm is skipped entirely; an alarmed media asset is kept (§4 legal hold).
 */
export async function deleteExpiredSuspendedChildren(now = new Date()): Promise<{ deleted: number; held: number }> {
  const expired = await prisma.child.findMany({
    where: { suspendedAt: { not: null }, deleteAfter: { lte: now }, deletedAt: null },
    select: { id: true },
  });
  const heldMedia = await activeAlarmMediaIds();
  let deleted = 0;
  let held = 0;
  for (const { id } of expired) {
    const childAlarm = await prisma.alarm.count({ where: { childId: id, status: "ACTIVE" } });
    if (childAlarm > 0) {
      held++;
      continue;
    }
    await withRlsBypass(async (tx) => {
      const tags = await tx.momentChild.findMany({ where: { childId: id }, select: { momentId: true } });
      const own: string[] = [];
      for (const { momentId } of tags) {
        if ((await tx.momentChild.count({ where: { momentId } })) === 1) own.push(momentId);
      }
      const media = await tx.mediaAsset.findMany({
        where: {
          OR: [{ momentId: { in: own } }, { avatarForChildId: id }, { coverForChildId: id }, { listItemImageFor: { childId: id } }],
        },
      });
      const doomed = media.filter((m) => !heldMedia.has(m.id));
      // Alarmed media survives, detached from what's being deleted.
      const kept = media.filter((m) => heldMedia.has(m.id)).map((m) => m.id);
      if (kept.length) {
        await tx.mediaAsset.updateMany({
          where: { id: { in: kept } },
          data: { momentId: null, avatarForChildId: null, coverForChildId: null, listItemImageForId: null },
        });
      }
      for (const m of doomed) {
        for (const path of [m.originalPath, m.derivedPath, m.playablePath, m.sharedOriginalPath]) {
          if (path) await mediaStorage.delete(path).catch(() => undefined);
        }
      }
      await tx.mediaAsset.deleteMany({ where: { id: { in: doomed.map((m) => m.id) } } });
      await tx.moment.deleteMany({ where: { id: { in: own } } });
      await tx.child.delete({ where: { id } });
    });
    deleted++;
  }
  return { deleted, held };
}
