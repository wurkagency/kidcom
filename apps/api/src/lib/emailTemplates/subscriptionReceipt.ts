import type { VatBreakdown } from "@kidcom/shared";

import { escapeHtml, renderEmailShell } from "./layout";

function formatMinorUnits(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

// D9 (spec 9.14/§6.3): the first invoice/receipt this app has ever sent.
// The charged amount is already correct (gross, VAT-inclusive) — this only
// adds the rate/amount breakdown Danish VAT invoicing rules expect on a
// *faktura* (spec §6.5 pt.1). Same table/inline-style shell as the other
// transactional templates in this folder.
export function renderSubscriptionReceiptHtml(options: {
  tierLabel: string;
  billingPeriodLabel: string;
  vat: VatBreakdown;
  chargedAt: Date;
}): string {
  const { tierLabel, billingPeriodLabel, vat, chargedAt } = options;

  const row = (label: string, value: string, emphasize = false) => `
  <tr>
    <td style="padding:8px 0;font-size:${emphasize ? "15px" : "13px"};color:${emphasize ? "#1e2922" : "#5e6d62"};font-weight:${emphasize ? "700" : "400"};">${escapeHtml(label)}</td>
    <td align="right" style="padding:8px 0;font-size:${emphasize ? "15px" : "13px"};color:${emphasize ? "#1e2922" : "#5e6d62"};font-weight:${emphasize ? "700" : "400"};">${escapeHtml(value)}</td>
  </tr>`;

  const bodyHtml = `
<h2 style="margin:16px 0 8px 0;font-size:26px;line-height:1.25;font-weight:700;color:#1b3d2b;letter-spacing:-0.015em;text-align:center;">Your receipt</h2>
<p style="margin:0 auto 24px auto;font-size:14.5px;line-height:1.6;color:#4b5563;max-width:480px;text-align:center;">
  Thanks for subscribing to KidCom ${escapeHtml(tierLabel)} (${escapeHtml(billingPeriodLabel)}). Here's the breakdown for your records.
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9faf6;border:1px solid #e6eae0;border-radius:16px;margin:0 0 24px 0;">
<tbody><tr><td style="padding:20px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody>
${row("Date", chargedAt.toISOString().slice(0, 10))}
${row("Plan", `${tierLabel} (${billingPeriodLabel})`)}
${row(`Price excl. VAT`, `${formatMinorUnits(vat.netMinorUnits)} kr`)}
${row(`VAT (${vat.vatRatePercent}%)`, `${formatMinorUnits(vat.vatMinorUnits)} kr`)}
<tr><td colspan="2" style="border-top:1px solid #e6eae0;padding-top:8px;"></td></tr>
${row("Total charged", `${formatMinorUnits(vat.grossMinorUnits)} kr`, true)}
</tbody>
</table>
</td></tr></tbody></table>
<p style="margin:0;font-size:12px;color:#5e6d62;text-align:center;">
  KidCom ApS &middot; Prices shown are in DKK, incl. 25% Danish VAT.
</p>`;

  return renderEmailShell({
    title: "Your KidCom receipt",
    preheader: `Receipt for your KidCom ${tierLabel} subscription — ${formatMinorUnits(vat.grossMinorUnits)} kr incl. VAT.`,
    badgeText: "Subscription receipt",
    bodyHtml,
    footerNote: "You are receiving this transactional email because a subscription payment was processed on your account.",
  });
}

export function renderSubscriptionReceiptText(options: {
  tierLabel: string;
  billingPeriodLabel: string;
  vat: VatBreakdown;
  chargedAt: Date;
}): string {
  const { tierLabel, billingPeriodLabel, vat, chargedAt } = options;
  return [
    `Your KidCom receipt`,
    ``,
    `Date: ${chargedAt.toISOString().slice(0, 10)}`,
    `Plan: ${tierLabel} (${billingPeriodLabel})`,
    `Price excl. VAT: ${formatMinorUnits(vat.netMinorUnits)} kr`,
    `VAT (${vat.vatRatePercent}%): ${formatMinorUnits(vat.vatMinorUnits)} kr`,
    `Total charged: ${formatMinorUnits(vat.grossMinorUnits)} kr`,
    ``,
    `Prices shown are in DKK, incl. 25% Danish VAT.`,
  ].join("\n");
}
