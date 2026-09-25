import type { BillingPeriod } from "@kinnd/shared";

import { prisma } from "../db";
import * as quickpay from "./quickpay";
import { activateAfterAuthorization } from "./billingActivation";
import { sendReceiptEmail } from "./billingReceipt";

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
      // A missed webhook, not an abandoned checkout: do what the webhook
      // would have done — charge the first period, then switch the plan on.
      // Never ACTIVE without that charge; a declined card goes back to Free.
      try {
        const { result } = await activateAfterAuthorization(sub.id, now);
        if (result === "activated") {
          await sendReceiptEmail(sub.ownerId, sub.tier as "PARENTS" | "FAMILY", sub.billingPeriod as BillingPeriod);
          healed++;
        } else if (result === "declined") {
          reverted++;
        }
      } catch (err) {
        // The charge request itself failed: it may or may not have gone
        // through, so leave the row PENDING and try again on the next run
        // (the fixed order_id makes the retry safe).
        // eslint-disable-next-line no-console
        console.error(`Billing reconciliation: could not charge subscription ${sub.id}, retrying next run:`, err);
      }
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
