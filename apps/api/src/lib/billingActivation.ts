import crypto from "node:crypto";
import { TIERS } from "@kinnd/shared";

import { prisma } from "../db";
import { config } from "../config";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "./billingPricing";
import { endCircle, reactivateCircle } from "./circleLifecycle";
import * as quickpay from "./quickpay";
import { paymentOutcome, QuickPayError, type Payment, type QpStatusCode } from "./quickpay";

// A QuickPay subscription starts as a card authorisation; nothing is charged
// until we ask. Once the customer has authorised (the subscription callback,
// or they return to the app and it confirms):
//  - a Circle still in its free trial just records the card (D3: no card
//    at signup; the first charge waits for the trial to end);
//  - otherwise the first period is charged here and the Circle goes ACTIVE.
//
// Safe to call twice — the webhook, the app's confirm and the jobs can race:
// the first charge's order_id is derived from the subscription, QuickPay
// refuses a second payment with the same order_id, and the loser looks up
// how that one payment went. The customer is charged at most once, and the
// Circle only goes ACTIVE if the charge wasn't declined.

export type ActivationResult = "activated" | "authorized" | "already" | "pending" | "declined" | "failed";
export type Activation = { result: ActivationResult; qpStatusCode: QpStatusCode | null };

/** Deterministic, ≤ 20 characters, unique per subscription (QuickPay's order_id rules). */
export function firstChargeOrderId(subscriptionRowId: string, quickpaySubscriptionId: string): string {
  return `f${crypto.createHash("sha256").update(`${subscriptionRowId}:${quickpaySubscriptionId}`).digest("hex").slice(0, 19)}`;
}

const DUPLICATE_ORDER = /order[_ ]id.*(already|exists|taken|unique)|already.*order/i;
const done = (result: ActivationResult, qpStatusCode: QpStatusCode | null = null): Activation => ({ result, qpStatusCode });

/**
 * A Circle has just become active (paid, trial started, or coupon): the
 * owner's own children on Single move into it (up to its limit), and family
 * granted through it earlier gets access back (D10).
 */
export async function onCircleActivated(circleId: string): Promise<void> {
  const circle = await prisma.subscription.findUniqueOrThrow({ where: { id: circleId } });
  const inCircle = await prisma.child.count({ where: { circleId, deletedAt: null } });
  const room = Math.max(0, TIERS[circle.tier].children - inCircle);
  if (room > 0) {
    const own = await prisma.childAccess.findMany({
      where: { userId: circle.ownerId, role: { in: ["PARENT", "GUARDIAN"] }, child: { circleId: null, deletedAt: null } },
      select: { childId: true },
      orderBy: { createdAt: "asc" },
      take: room,
    });
    if (own.length) await prisma.child.updateMany({ where: { id: { in: own.map((o) => o.childId) } }, data: { circleId } });
  }
  await reactivateCircle(circleId);
}

export async function activateAfterAuthorization(subscriptionRowId: string, now = new Date()): Promise<Activation> {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionRowId } });
  if (!sub || !sub.quickpaySubscriptionId) return done("failed");
  if (sub.tier === "FREE" || !sub.billingPeriod) return done("failed");
  const trialRunning = sub.status === "TRIALING" && !!sub.trialEndsAt && sub.trialEndsAt > now;
  if (sub.status !== "PENDING" && sub.status !== "TRIALING") return done("already");

  const real = await quickpay.getSubscription(Number(sub.quickpaySubscriptionId));
  if (!real.accepted) return done("pending");
  if (real.test_mode && !config.quickpayAcceptTestCards) {
    // A QuickPay test card: no money would move. Not accepted in production.
    // eslint-disable-next-line no-console
    console.error(`Subscription ${sub.id}: refused a test-card authorisation (QUICKPAY_ACCEPT_TEST_CARDS is off)`);
    await prisma.subscription.update({
      where: { id: sub.id },
      data:
        sub.status === "PENDING"
          ? { tier: "FREE", status: "ACTIVE", billingPeriod: null, quickpaySubscriptionId: null, cardAuthorizedAt: null }
          : { quickpaySubscriptionId: null, cardAuthorizedAt: null },
    });
    return done("declined");
  }

  // D3: during the trial the card is only recorded; the first charge waits.
  if (trialRunning) {
    if (!sub.cardAuthorizedAt) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { cardAuthorizedAt: now } });
      return done("authorized");
    }
    return done("already");
  }

  const orderId = firstChargeOrderId(sub.id, sub.quickpaySubscriptionId);
  let payment: Payment | null;
  try {
    payment = await quickpay.chargeRecurring({
      subscriptionId: Number(sub.quickpaySubscriptionId),
      amountMinorUnits: BILLING_PRICES_ORE[sub.tier][sub.billingPeriod],
      orderId,
    });
  } catch (err) {
    if (!(err instanceof QuickPayError && DUPLICATE_ORDER.test(err.providerText))) throw err;
    // The other path already made this charge: go by how that payment went —
    // never assume it succeeded.
    [payment = null] = await quickpay.findPaymentsByOrderId(orderId);
  }

  const outcome = paymentOutcome(payment);
  if (outcome.declined) {
    if (sub.status === "TRIALING") {
      // The trial's first charge was declined: declined is declined (D5).
      await endCircle(sub.id, now);
    } else {
      // A new checkout was declined: nothing was active yet, so the row just
      // goes back to Single; the customer can check out with another card.
      await prisma.subscription.updateMany({
        where: { id: sub.id, status: "PENDING" },
        data: { tier: "FREE", status: "ACTIVE", billingPeriod: null, currentPeriodEnd: null, quickpaySubscriptionId: null, cardAuthorizedAt: null },
      });
    }
    return done("declined", outcome.qpStatusCode);
  }

  const { count } = await prisma.subscription.updateMany({
    where: { id: sub.id, status: { in: ["PENDING", "TRIALING"] } },
    data: {
      status: "ACTIVE",
      currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_DAYS[sub.billingPeriod] * 24 * 60 * 60 * 1000),
      lastChargeOrderId: orderId,
      cardAuthorizedAt: sub.cardAuthorizedAt ?? now,
      pastDueSince: null,
      trialEndsAt: null,
    },
  });
  if (count > 0) await onCircleActivated(sub.id);
  return done(count > 0 ? "activated" : "already");
}
