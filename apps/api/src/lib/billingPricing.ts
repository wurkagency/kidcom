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

// Free caps at 1 child; Parents and Family are both unlimited. (Earlier
// pricing copy read Parents as 1-child-only, but the PRD's fuller
// description — and the product decision this cap now follows — is that
// Parents unlocks the same unlimited child count as Family; only Free stays
// capped.) Trial users get the same unlimited cap while trialing regardless
// of their nominal FREE tier — see the isTrialing check at the child-
// creation call site in routes/children/index.ts, which bypasses this
// function entirely for that case.
export function childCapForTier(tier: "FREE" | "PARENTS" | "FAMILY"): number {
  return tier === "FREE" ? 1 : Infinity;
}
