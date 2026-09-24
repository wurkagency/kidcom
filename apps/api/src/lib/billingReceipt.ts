import type { BillingPeriod } from "@kidcom/shared";
import { vatBreakdown } from "@kidcom/shared";

import { prisma } from "../db";
import { BILLING_PRICES_ORE } from "./billingPricing";
import { mailSender } from "./mailSender";
import { renderSubscriptionReceiptHtml, renderSubscriptionReceiptText } from "./emailTemplates/subscriptionReceipt";

const TIER_LABELS: Record<"PARENTS" | "FAMILY", string> = { PARENTS: "Parents", FAMILY: "Family" };
const PERIOD_LABELS: Record<BillingPeriod, string> = { MONTHLY: "Monthly", ANNUAL: "Annual" };

// D9 (spec 9.14/§6.3): sends the VAT-breakdown receipt this app never had
// before. Called only for a subscription that has actually just gone
// ACTIVE with a real paid tier — never for FREE (nothing was charged) and
// never for a merely-PENDING checkout. Email failures are swallowed and
// logged, same treatment as the verification email elsewhere in this repo —
// the payment itself already succeeded and must not be rolled back over a
// receipt delivery failure.
export async function sendReceiptEmail(ownerId: string, tier: "PARENTS" | "FAMILY", billingPeriod: BillingPeriod) {
  try {
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) return;
    const vat = vatBreakdown(BILLING_PRICES_ORE[tier][billingPeriod]);
    const chargedAt = new Date();
    await mailSender.send({
      to: owner.email,
      subject: `Your KidCom ${TIER_LABELS[tier]} receipt`,
      text: renderSubscriptionReceiptText({ tierLabel: TIER_LABELS[tier], billingPeriodLabel: PERIOD_LABELS[billingPeriod], vat, chargedAt }),
      html: renderSubscriptionReceiptHtml({ tierLabel: TIER_LABELS[tier], billingPeriodLabel: PERIOD_LABELS[billingPeriod], vat, chargedAt }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to send subscription receipt email for owner ${ownerId}:`, err);
  }
}
