import crypto from "node:crypto";
import type { CircleDto, PaidTier, SubscriptionDto, SubscriptionTier } from "@kidcom/shared";
import { TIERS, TRIAL_DAYS, tierAtLeast, tierBlockReasons } from "@kidcom/shared";

import { prisma } from "../db";
import { config } from "../config";
import { ApiError } from "../middleware/errorHandler";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "./billingPricing";
import { activateAfterAuthorization, onCircleActivated } from "./billingActivation";
import { sendReceiptEmail } from "./billingReceipt";
import { circleUsage, consumptionBytes, heldCircles, isCircleActive, singleUsage, tierAvailability } from "./circles";
import { endCircle, suspendChild } from "./circleLifecycle";
import { mailSender } from "./mailSender";
import { notify } from "./notify";
import { notifyPaymentFailure } from "./paymentFailureNotice";
import { normalizeCouponCode } from "./coupons";
import * as quickpay from "./quickpay";
import { paymentOutcome, type Payment } from "./quickpay";

// The subscription model's billing flows (tasks: subscription model plan):
// trials without a card (D3), Circles (§2), lifetime coupons, tier changes
// with downgrade blocking, cancellation, Family Circle members (rule 3), and
// the daily jobs: trial reminders and endings, renewals, and the end of
// cancelled Circles. "Declined is declined" (D5): any failed charge ends the
// Circle at once, through circleLifecycle.endCircle.

const DAY_MS = 24 * 60 * 60 * 1000;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

async function ownRow(userId: string) {
  return prisma.subscription.upsert({ where: { ownerId: userId }, update: {}, create: { ownerId: userId } });
}

async function circleDto(userId: string): Promise<CircleDto | null> {
  const held = await heldCircles(userId);
  const primary = held.find((h) => h.role === "OWNER") ?? held[0];
  if (!primary) return null;
  const c = primary.circle;
  const [owner, childCount, members, invites] = await Promise.all([
    prisma.user.findUnique({ where: { id: c.ownerId }, select: { firstName: true, lastName: true } }),
    prisma.child.count({ where: { circleId: c.id, deletedAt: null } }),
    prisma.circleMember.findMany({ where: { circleId: c.id }, include: { user: { select: { firstName: true, lastName: true } } } }),
    primary.role === "OWNER"
      ? prisma.invite.findMany({ where: { circleId: c.id, childId: null, acceptedAt: null }, select: { id: true, email: true } })
      : Promise.resolve([]),
  ]);
  const name = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");
  return {
    id: c.id,
    role: primary.role,
    tier: c.tier as PaidTier,
    ownerName: name(owner),
    childCount,
    members: members.map((m) => ({ userId: m.userId, name: name(m.user) })),
    pendingInvites: invites.map((i) => ({ id: i.id, email: i.email ?? "" })),
  };
}

/** GET /billing/status */
export async function billingStatus(userId: string, now = new Date()): Promise<SubscriptionDto> {
  const [own, user, held] = await Promise.all([
    ownRow(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { trialStartedAt: true } }),
    heldCircles(userId),
  ]);
  const ownActive = isCircleActive(own, now);
  const tier = held.reduce<SubscriptionTier>((best, h) => (tierAtLeast(h.circle.tier, best) ? h.circle.tier : best), "FREE");
  const usage = ownActive ? await circleUsage(own) : await singleUsage(userId);
  const member = held.find((h) => h.role === "MEMBER");
  return {
    tier,
    status: ownActive || own.status === "PENDING" ? own.status : "ACTIVE",
    billingPeriod: ownActive ? own.billingPeriod : null,
    trialEndsAt: ownActive && own.status === "TRIALING" ? (own.trialEndsAt?.toISOString() ?? null) : null,
    currentPeriodEnd: ownActive ? (own.currentPeriodEnd?.toISOString() ?? null) : (member?.circle.currentPeriodEnd?.toISOString() ?? null),
    trialExpired: own.status === "TRIALING" && !!own.trialEndsAt && own.trialEndsAt < now,
    trialAvailable: !user.trialStartedAt && !ownActive,
    cardOnFile: ownActive && !!own.cardAuthorizedAt && !!own.quickpaySubscriptionId,
    lifetime: ownActive && !!own.couponId,
    circle: await circleDto(userId),
    storage: { usedBytes: await consumptionBytes(userId), limitBytes: TIERS[tier].storageBytes },
    tiers: tierAvailability(usage),
  };
}

/** Refuses a tier the current use doesn't fit (§2 downgrade rule, D12). */
async function assertFits(userId: string, tier: SubscriptionTier): Promise<void> {
  const own = await ownRow(userId);
  const usage = isCircleActive(own) ? await circleUsage(own) : await singleUsage(userId);
  const reasons = tierBlockReasons(tier, usage);
  if (reasons.length) {
    throw new ApiError(409, "What you use doesn't fit that plan", "TIER_UNAVAILABLE", { tier, reasons });
  }
}

/** POST /billing/trial — 30 days, no card (D3). One trial per person, ever. */
export async function startTrial(userId: string, tier: PaidTier, now = new Date()): Promise<void> {
  const [own, user] = await Promise.all([
    ownRow(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { trialStartedAt: true } }),
  ]);
  if (isCircleActive(own, now)) throw new ApiError(409, "You already have a plan", "ALREADY_SUBSCRIBED");
  if (user.trialStartedAt) throw new ApiError(409, "You've already had your free trial", "TRIAL_USED");
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: own.id },
      data: {
        tier,
        status: "TRIALING",
        trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
        billingPeriod: null,
        currentPeriodEnd: null,
        quickpaySubscriptionId: null,
        cardAuthorizedAt: null,
        couponId: null,
        trialReminder7SentAt: null,
        trialReminder1SentAt: null,
      },
    }),
    prisma.user.update({ where: { id: userId }, data: { trialStartedAt: now } }),
  ]);
  await onCircleActivated(own.id);
}

/**
 * Directly switches a Circle on without QuickPay — local development, or
 * BILLING_TEST_MODE while a deployment is being tested.
 */
export async function activateWithoutPayment(userId: string, tier: PaidTier, period: "MONTHLY" | "ANNUAL", now = new Date()): Promise<void> {
  const own = await ownRow(userId);
  await prisma.subscription.update({
    where: { id: own.id },
    data: {
      tier,
      status: "ACTIVE",
      billingPeriod: period,
      currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_DAYS[period] * DAY_MS),
      trialEndsAt: null,
      quickpaySubscriptionId: null,
      couponId: null,
    },
  });
  await onCircleActivated(own.id);
}

/**
 * POST /billing/checkout (with QuickPay): creates the QuickPay subscription
 * and returns its payment window. In a running trial the card is only
 * recorded (charged when the trial ends); otherwise the first period is
 * charged once the card is authorised.
 */
export async function startCheckout(
  userId: string,
  tier: PaidTier,
  period: "MONTHLY" | "ANNUAL",
  withdrawalConsentAt: Date,
  now = new Date()
): Promise<{ redirectUrl: string }> {
  const own = await ownRow(userId);
  if (own.couponId && isCircleActive(own, now)) throw new ApiError(409, "You have a lifetime plan", "LIFETIME_PLAN");
  const trialRunning = own.status === "TRIALING" && !!own.trialEndsAt && own.trialEndsAt > now;
  if (!trialRunning && isCircleActive(own, now) && own.status !== "CANCELED") {
    throw new ApiError(409, "You already have a plan — change it from the plan page", "ALREADY_SUBSCRIBED");
  }
  if (!tierAtLeast(tier, own.tier === "FREE" ? "FREE" : own.tier)) await assertFits(userId, tier);

  const orderId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const created = await quickpay.createSubscription({ orderId, currency: "DKK", description: `KidCom ${tier} (${period})` });
  await prisma.subscription.update({
    where: { id: own.id },
    data: {
      tier,
      status: trialRunning ? "TRIALING" : "PENDING",
      billingPeriod: period,
      quickpaySubscriptionId: String(created.id),
      cardAuthorizedAt: null,
      withdrawalConsentAt,
    },
  });
  const link = await quickpay.getSubscriptionLink({
    subscriptionId: created.id,
    amountMinorUnits: BILLING_PRICES_ORE[tier][period],
    continueUrl: `${config.webBaseUrl}/billing?checkout=success`,
    cancelUrl: `${config.webBaseUrl}/billing?checkout=cancel`,
    callbackUrl: `${config.apiBaseUrl}/billing/webhook`,
  });
  return { redirectUrl: link.url };
}

/** POST /billing/change — switch tier. Downgrades only when the use fits (§2). */
export async function changeTier(userId: string, tier: PaidTier, now = new Date()): Promise<void> {
  const own = await ownRow(userId);
  if (!isCircleActive(own, now)) throw new ApiError(409, "You don't have a plan to change", "NO_PLAN");
  if (own.couponId) throw new ApiError(409, "You have a lifetime plan", "LIFETIME_PLAN");
  if (own.tier === tier) return;
  if (!tierAtLeast(tier, own.tier)) await assertFits(userId, tier);
  // The new price applies from the next charge.
  await prisma.subscription.update({ where: { id: own.id }, data: { tier } });
  if (tierAtLeast(tier, own.tier)) await onCircleActivated(own.id);
}

/**
 * POST /billing/cancel — only while what the Circle uses fits Single (§2).
 * A trial ends at once; a paid plan runs to the end of the period already
 * paid for, then drops to Single (the daily job).
 */
export async function cancelCircle(userId: string, now = new Date()): Promise<void> {
  const own = await ownRow(userId);
  if (!isCircleActive(own, now)) return;
  if (own.couponId) throw new ApiError(409, "You have a lifetime plan", "LIFETIME_PLAN");
  await assertFits(userId, "FREE");
  if (own.quickpaySubscriptionId) {
    await quickpay.cancelSubscription(Number(own.quickpaySubscriptionId)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`QuickPay cancel failed for subscription ${own.id}:`, err);
    });
  }
  if (own.status === "TRIALING" || !own.currentPeriodEnd || own.currentPeriodEnd <= now) {
    await endCircle(own.id, now);
    return;
  }
  await prisma.subscription.update({ where: { id: own.id }, data: { status: "CANCELED", quickpaySubscriptionId: null } });
}

export { normalizeCouponCode };

/** POST /billing/coupon — a lifetime coupon switches the owner's Circle on, never billed. */
export async function redeemCoupon(userId: string, rawCode: string, now = new Date()): Promise<void> {
  const code = normalizeCouponCode(rawCode);
  const coupon = code ? await prisma.coupon.findUnique({ where: { code } }) : null;
  if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt < now)) {
    throw new ApiError(404, "That code isn't valid", "COUPON_INVALID");
  }
  if (await prisma.couponRedemption.findUnique({ where: { couponId_userId: { couponId: coupon.id, userId } } })) {
    throw new ApiError(409, "You've already used that code", "COUPON_ALREADY_REDEEMED");
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    throw new ApiError(409, "That code has been used up", "COUPON_USED_UP");
  }
  const own = await ownRow(userId);
  if (own.couponId && isCircleActive(own, now)) throw new ApiError(409, "You already have a lifetime plan", "LIFETIME_PLAN");
  if (isCircleActive(own, now) && !tierAtLeast(coupon.tier, own.tier)) await assertFits(userId, coupon.tier);
  if (own.quickpaySubscriptionId) {
    await quickpay.cancelSubscription(Number(own.quickpaySubscriptionId)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`QuickPay cancel failed for subscription ${own.id}:`, err);
    });
  }
  await prisma.$transaction(async (tx) => {
    // Claims one use atomically, so two people can't both take the last one.
    const claimed = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        active: true,
        ...(coupon.maxRedemptions !== null ? { redemptionCount: { lt: coupon.maxRedemptions } } : {}),
      },
      data: { redemptionCount: { increment: 1 } },
    });
    if (claimed.count === 0) throw new ApiError(409, "That code has been used up", "COUPON_USED_UP");
    await tx.couponRedemption.create({ data: { couponId: coupon.id, userId } });
    await tx.subscription.update({
      where: { id: own.id },
      data: {
        tier: coupon.tier,
        status: "ACTIVE",
        couponId: coupon.id,
        billingPeriod: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        quickpaySubscriptionId: null,
        cardAuthorizedAt: null,
      },
    });
  });
  await onCircleActivated(own.id);
}

// ---------------------------------------------------------------------------
// Family Circle members (rule 3)
// ---------------------------------------------------------------------------

async function ownedFamilyCircle(userId: string) {
  const own = await ownRow(userId);
  if (!isCircleActive(own) || own.tier !== "FAMILY") {
    throw new ApiError(403, "Inviting parents into your Circle needs a Family Circle", "PLAN_REQUIRED", {
      requiredTier: "FAMILY",
      reason: "CIRCLE_MEMBERS",
    });
  }
  return own;
}

/** POST /billing/circle/invites — invite another parent into the owner's Family Circle. */
export async function inviteToCircle(userId: string, email: string): Promise<{ id: string; token: string }> {
  const circle = await ownedFamilyCircle(userId);
  const invite = await prisma.invite.create({
    data: { circleId: circle.id, role: "PARENT", email: email.toLowerCase(), invitedById: userId },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true } });
  await mailSender.send({
    to: email,
    subject: `${owner.firstName} invites you into their KidCom Family Circle`,
    text:
      `${owner.firstName} pays for a KidCom Family Circle and invites you in. Your children can join it, ` +
      `and you decide who sees them.\n\nAccept here: ${config.webBaseUrl}/invite/${invite.token}`,
  });
  return { id: invite.id, token: invite.token };
}

export async function cancelCircleInvite(userId: string, inviteId: string): Promise<void> {
  const own = await ownRow(userId);
  await prisma.invite.deleteMany({ where: { id: inviteId, circleId: own.id, acceptedAt: null } });
}

/**
 * A parent member leaves (or is removed): their children leave the Circle.
 * Each goes into a Circle the member owns if it has room, else to their
 * Single if it fits there alone, else it's suspended with the take-over
 * offer (D5). Family granted through the old Circle on those children loses
 * access (D10) until someone pays for them.
 */
async function detachMember(circleId: string, memberId: string, now = new Date()): Promise<void> {
  const circle = await prisma.subscription.findUniqueOrThrow({ where: { id: circleId } });
  const theirs = await prisma.childAccess.findMany({
    where: { userId: memberId, role: { in: ["PARENT", "GUARDIAN"] }, child: { circleId, deletedAt: null } },
    select: { childId: true },
  });
  const ownerChildren = new Set(
    (
      await prisma.childAccess.findMany({
        where: { userId: circle.ownerId, childId: { in: theirs.map((t) => t.childId) }, role: { in: ["PARENT", "GUARDIAN"] } },
        select: { childId: true },
      })
    ).map((r) => r.childId)
  );
  await prisma.circleMember.deleteMany({ where: { circleId, userId: memberId } });

  const ownCircle = (await heldCircles(memberId)).find((h) => h.role === "OWNER")?.circle ?? null;
  for (const { childId } of theirs) {
    if (ownerChildren.has(childId)) continue; // the owner's own child stays
    const others = await prisma.childAccess.count({ where: { childId, userId: { not: memberId } } });
    if (ownCircle && (await prisma.child.count({ where: { circleId: ownCircle.id, deletedAt: null } })) < TIERS[ownCircle.tier].children) {
      await prisma.child.update({ where: { id: childId }, data: { circleId: ownCircle.id } });
    } else if (others === 0 && (await singleUsage(memberId)).children < TIERS.FREE.children) {
      await prisma.child.update({ where: { id: childId }, data: { circleId: null } });
    } else {
      await suspendChild(childId, now);
      continue;
    }
    const lapsed = await prisma.childAccess.findMany({ where: { childId, grantedViaCircleId: circleId } });
    if (lapsed.length) {
      await prisma.$transaction([
        prisma.suspendedChildAccess.createMany({
          data: lapsed.map((r) => ({
            childId: r.childId,
            userId: r.userId,
            role: r.role,
            relationship: r.relationship,
            medicalInfoAccess: r.medicalInfoAccess,
            isMinorMember: r.isMinorMember,
            grantedViaCircleId: r.grantedViaCircleId,
            originalCreatedAt: r.createdAt,
            reason: "CIRCLE_ENDED" as const,
          })),
          skipDuplicates: true,
        }),
        prisma.childAccess.deleteMany({ where: { id: { in: lapsed.map((r) => r.id) } } }),
      ]);
    }
  }
}

/** DELETE /billing/circle/members/:userId — the owner removes a parent member. */
export async function removeCircleMember(ownerId: string, memberId: string): Promise<void> {
  const own = await ownRow(ownerId);
  const member = await prisma.circleMember.findUnique({ where: { userId: memberId } });
  if (!member || member.circleId !== own.id) throw new ApiError(404, "That person isn't in your Circle");
  await detachMember(own.id, memberId);
}

/** POST /billing/circle/leave — a parent member leaves the Circle they're in. */
export async function leaveCircle(userId: string): Promise<void> {
  const member = await prisma.circleMember.findUnique({ where: { userId } });
  if (!member) return;
  await detachMember(member.circleId, userId);
}

// ---------------------------------------------------------------------------
// Daily jobs
// ---------------------------------------------------------------------------

/** Reminders 7 days and 1 day before a trial ends (email and push). */
export async function sendTrialReminders(now = new Date()): Promise<number> {
  const trials = await prisma.subscription.findMany({
    where: { status: "TRIALING", trialEndsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) } },
    include: { owner: { select: { email: true, deletedAt: true } } },
  });
  let sent = 0;
  for (const t of trials) {
    const daysLeft = (t.trialEndsAt!.getTime() - now.getTime()) / DAY_MS;
    const stage = daysLeft <= 1 ? 1 : 7;
    if ((stage === 7 && t.trialReminder7SentAt) || (stage === 1 && t.trialReminder1SentAt) || t.owner.deletedAt) continue;
    const date = fmtDate(t.trialEndsAt!);
    await notify([t.ownerId], { kind: "trial.ending", params: { date }, url: "/billing" });
    try {
      await mailSender.send({
        to: t.owner.email,
        subject: `Your KidCom trial ends on ${date}`,
        text: t.cardAuthorizedAt
          ? `Your free trial ends on ${date}. Your plan then continues on the card you added.`
          : `Your free trial ends on ${date}. Add a card to keep your plan: ${config.webBaseUrl}/billing`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Trial reminder for subscription ${t.id} failed:`, err);
    }
    await prisma.subscription.update({
      where: { id: t.id },
      data: stage === 7 ? { trialReminder7SentAt: now } : { trialReminder1SentAt: now, trialReminder7SentAt: t.trialReminder7SentAt ?? now },
    });
    sent++;
  }
  return sent;
}

/** Trials that have ended: charge the card on file, or end the Circle (D5). */
export async function finishTrials(now = new Date()): Promise<{ charged: number; ended: number }> {
  const ended = await prisma.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { lte: now } } });
  let charged = 0;
  let endedCount = 0;
  for (const sub of ended) {
    if (sub.cardAuthorizedAt && sub.quickpaySubscriptionId && sub.billingPeriod) {
      try {
        const { result } = await activateAfterAuthorization(sub.id, now);
        if (result === "activated") {
          await sendReceiptEmail(sub.ownerId, sub.tier as PaidTier, sub.billingPeriod);
          charged++;
          continue;
        }
        if (result === "declined") {
          await notifyPaymentFailure(sub.ownerId);
          endedCount++;
          continue;
        }
      } catch (err) {
        // The charge request itself failed; retry on the next run.
        // eslint-disable-next-line no-console
        console.error(`Trial charge for subscription ${sub.id} failed, retrying next run:`, err);
        continue;
      }
    }
    await endCircle(sub.id, now);
    endedCount++;
  }
  return { charged, ended: endedCount };
}

/** Renewals: charge the next period; a declined charge ends the Circle at once (D5). */
export async function renewCircles(now = new Date()): Promise<{ renewed: number; ended: number }> {
  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", tier: { in: ["PARENTS", "FAMILY"] }, couponId: null, currentPeriodEnd: { lte: now } },
  });
  let renewed = 0;
  let ended = 0;
  for (const sub of due) {
    if (!sub.quickpaySubscriptionId || !sub.billingPeriod) {
      await endCircle(sub.id, now);
      ended++;
      continue;
    }
    const orderId = `renew${now.getTime().toString(36)}${sub.id.slice(-4)}`.slice(0, 20);
    let payment: Payment | null = null;
    try {
      payment = await quickpay.chargeRecurring({
        subscriptionId: Number(sub.quickpaySubscriptionId),
        amountMinorUnits: BILLING_PRICES_ORE[sub.tier as PaidTier][sub.billingPeriod],
        orderId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Renewal charge failed for subscription ${sub.id}:`, err);
    }
    if (!payment || paymentOutcome(payment).declined) {
      await endCircle(sub.id, now);
      await notifyPaymentFailure(sub.ownerId);
      ended++;
      continue;
    }
    await prisma.subscription.update({
      where: { id: sub.id },
      // The payment callback finds this subscription by the order_id.
      data: { currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_DAYS[sub.billingPeriod] * DAY_MS), lastChargeOrderId: orderId },
    });
    await sendReceiptEmail(sub.ownerId, sub.tier as PaidTier, sub.billingPeriod);
    renewed++;
  }
  return { renewed, ended };
}

/** Cancelled Circles whose paid period has run out drop to Single. */
export async function endCancelledCircles(now = new Date()): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { status: "CANCELED", tier: { in: ["PARENTS", "FAMILY"] }, currentPeriodEnd: { lte: now } },
  });
  for (const sub of due) await endCircle(sub.id, now);
  return due.length;
}

/** A charge was declined after the fact (QuickPay payment callback). */
export async function handleDeclinedCharge(subscriptionId: string, now = new Date()): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub || !isCircleActive(sub, now) || sub.couponId) return;
  await endCircle(sub.id, now);
  await notifyPaymentFailure(sub.ownerId);
}
