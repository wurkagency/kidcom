import crypto from "node:crypto";

import { prisma } from "../db";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "./billingPricing";
import * as quickpay from "./quickpay";

// A QuickPay subscription starts as a card authorisation; nothing is charged
// until we ask. Once the customer has authorised (the subscription callback,
// or they return to the app and it confirms), the first period is charged
// here and the plan goes ACTIVE.
//
// Safe to call twice — the webhook and the app's confirm can race: the
// first charge's order_id is derived from the subscription, and QuickPay
// refuses a second payment with the same order_id, so the customer can
// never be charged twice for the same first period.

export type ActivationResult = "activated" | "already" | "pending" | "failed";

/** Deterministic, ≤ 20 characters, unique per subscription (QuickPay's order_id rules). */
export function firstChargeOrderId(subscriptionRowId: string, quickpaySubscriptionId: string): string {
  return `f${crypto.createHash("sha256").update(`${subscriptionRowId}:${quickpaySubscriptionId}`).digest("hex").slice(0, 19)}`;
}

const DUPLICATE_ORDER = /order[_ ]id.*(already|exists|taken|unique)|already.*order/i;

export async function activateAfterAuthorization(subscriptionRowId: string, now = new Date()): Promise<ActivationResult> {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionRowId } });
  if (!sub || !sub.quickpaySubscriptionId) return "failed";
  if (sub.status !== "PENDING") return "already";
  if (sub.tier === "FREE" || !sub.billingPeriod) return "failed";

  const real = await quickpay.getSubscription(Number(sub.quickpaySubscriptionId));
  if (!real.accepted) return "pending";

  const orderId = firstChargeOrderId(sub.id, sub.quickpaySubscriptionId);
  try {
    await quickpay.chargeRecurring({
      subscriptionId: Number(sub.quickpaySubscriptionId),
      amountMinorUnits: BILLING_PRICES_ORE[sub.tier][sub.billingPeriod],
      orderId,
    });
  } catch (err) {
    // The other path got there first — the first period is already charged.
    if (!(err instanceof Error && DUPLICATE_ORDER.test(err.message))) throw err;
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
  return count > 0 ? "activated" : "already";
}
