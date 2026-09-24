import crypto from "node:crypto";

import { prisma } from "../db";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "./billingPricing";
import * as quickpay from "./quickpay";
import { paymentOutcome, QuickPayError, type Payment, type QpStatusCode } from "./quickpay";

// A QuickPay subscription starts as a card authorisation; nothing is charged
// until we ask. Once the customer has authorised (the subscription callback,
// or they return to the app and it confirms), the first period is charged
// here and the plan goes ACTIVE.
//
// Safe to call twice — the webhook, the app's confirm and the nightly
// reconciliation can race: the first charge's order_id is derived from the
// subscription, QuickPay refuses a second payment with the same order_id,
// and the loser looks up how that one payment went. The customer is charged
// at most once, and the plan only goes ACTIVE if the charge wasn't declined.

export type ActivationResult = "activated" | "already" | "pending" | "declined" | "failed";
export type Activation = { result: ActivationResult; qpStatusCode: QpStatusCode | null };

/** Deterministic, ≤ 20 characters, unique per subscription (QuickPay's order_id rules). */
export function firstChargeOrderId(subscriptionRowId: string, quickpaySubscriptionId: string): string {
  return `f${crypto.createHash("sha256").update(`${subscriptionRowId}:${quickpaySubscriptionId}`).digest("hex").slice(0, 19)}`;
}

const DUPLICATE_ORDER = /order[_ ]id.*(already|exists|taken|unique)|already.*order/i;
const done = (result: ActivationResult, qpStatusCode: QpStatusCode | null = null): Activation => ({ result, qpStatusCode });

export async function activateAfterAuthorization(subscriptionRowId: string, now = new Date()): Promise<Activation> {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionRowId } });
  if (!sub || !sub.quickpaySubscriptionId) return done("failed");
  if (sub.status !== "PENDING") return done("already");
  if (sub.tier === "FREE" || !sub.billingPeriod) return done("failed");

  const real = await quickpay.getSubscription(Number(sub.quickpaySubscriptionId));
  if (!real.accepted) return done("pending");

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
    // Back to Free, so no path keeps retrying a card that was refused; the
    // customer can check out again with another card.
    await prisma.subscription.updateMany({
      where: { id: sub.id, status: "PENDING" },
      data: { tier: "FREE", status: "ACTIVE", billingPeriod: null, currentPeriodEnd: null, quickpaySubscriptionId: null, pastDueSince: null },
    });
    return done("declined", outcome.qpStatusCode);
  }

  const { count } = await prisma.subscription.updateMany({
    where: { id: sub.id, status: "PENDING" },
    data: {
      status: "ACTIVE",
      currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_DAYS[sub.billingPeriod] * 24 * 60 * 60 * 1000),
      lastChargeOrderId: orderId,
      pastDueSince: null,
    },
  });
  return done(count > 0 ? "activated" : "already");
}
