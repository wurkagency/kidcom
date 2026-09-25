import { TIER_PRICES_ORE } from "@kinnd/shared";

// Prices live in the shared tier catalogue (packages/shared/src/tiers.ts) so
// checkout, renewals and the app can never drift apart. Øre, VAT included.
export const BILLING_PRICES_ORE = TIER_PRICES_ORE;

export const BILLING_PERIOD_DAYS: Record<"MONTHLY" | "ANNUAL", number> = {
  MONTHLY: 30,
  ANNUAL: 365,
};
