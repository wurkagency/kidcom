import { prisma } from "../db";
import * as quickpay from "./quickpay";
import { BILLING_PERIOD_DAYS } from "./billingPricing";

// Post-launch backlog Phase E (D7) — an abandoned QuickPay checkout
// (createSubscription succeeded, the customer never finished the hosted
// payment window, no webhook ever arrives) used to leave a Subscription at
// tier:PARENTS/FAMILY, status:PENDING forever. Harmless (effectiveTier()
// only honors `tier` when `status` is ACTIVE/TRIALING — see
// middleware/billing.ts), but a real data-hygiene gap: a dead row any
// future code reading `tier` directly would inherit.
//
// Only reconciles rows that have sat in PENDING for at least this long —
// a checkout genuinely in progress (customer mid-payment-window) must never
// get reverted out from under them.
export const RECONCILE_AFTER_MS = 24 * 60 * 60 * 1000;

export type ReconciliationResult = { healed: number; reverted: number };

// Exported separately from the worker-job wrapper so it's unit-testable
// with a mocked quickpay client, no BullMQ/Redis needed.
export async function reconcilePendingSubscriptions(now: Date = new Date()): Promise<ReconciliationResult> {
  const stale = await prisma.subscription.findMany({
    where: { status: "PENDING", updatedAt: { lte: new Date(now.getTime() - RECONCILE_AFTER_MS) } },
  });

  let healed = 0;
  let reverted = 0;

  for (const sub of stale) {
    // No quickpaySubscriptionId at all shouldn't be reachable (PENDING is
    // only ever set alongside it — see billing/index.ts's POST /subscribe),
    // but if it ever happens there's nothing to reconcile against — revert.
    let accepted = false;
    if (sub.quickpaySubscriptionId) {
      try {
        const real = await quickpay.getSubscription(Number(sub.quickpaySubscriptionId));
        accepted = real.accepted;
      } catch {
        // QuickPay 404s an abandoned subscription, or the request fails —
        // either way, treat as never completed rather than retry forever.
        accepted = false;
      }
    }

    if (accepted) {
      // A missed webhook, not an abandoned checkout — self-heal to what the
      // webhook's accepted:true branch would have done.
      const periodDays = sub.billingPeriod ? BILLING_PERIOD_DAYS[sub.billingPeriod] : BILLING_PERIOD_DAYS.MONTHLY;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          currentPeriodEnd: new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000),
        },
      });
      healed++;
    } else {
      // Genuinely never completed — undo the premature tier bump rather
      // than leave a dead PENDING row lying around.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { tier: "FREE", status: "ACTIVE", billingPeriod: null, quickpaySubscriptionId: null, currentPeriodEnd: null },
      });
      reverted++;
    }
  }

  return { healed, reverted };
}
