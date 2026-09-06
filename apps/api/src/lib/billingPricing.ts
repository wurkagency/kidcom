// PRD pricing section, in øre (DKK minor units) — shared between the
// /billing/subscribe checkout flow and the worker's renewal job so they
// can never drift apart.
export const BILLING_PRICES_ORE: Record<"PARENTS" | "FAMILY", Record<"MONTHLY" | "ANNUAL", number>> = {
  PARENTS: { MONTHLY: 2900, ANNUAL: 27500 },
  FAMILY: { MONTHLY: 5900, ANNUAL: 55900 },
};

export const BILLING_PERIOD_DAYS: Record<"MONTHLY" | "ANNUAL", number> = {
  MONTHLY: 30,
  ANNUAL: 365,
};

// Free/Parents cap at 1 child, Family is unlimited (PRD: "Parent model
// gives full access to 1 kid... Family model gives full access to
// unlimited kids").
export function childCapForTier(tier: "FREE" | "PARENTS" | "FAMILY"): number {
  return tier === "FAMILY" ? Infinity : 1;
}
