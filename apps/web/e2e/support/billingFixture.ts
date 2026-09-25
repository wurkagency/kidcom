// Billing mocks in the subscription model's shapes (GET /billing/plans,
// GET /billing/status): every tier with its limits, Circles, storage and
// which tiers the current use fits.

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const plans = {
  currency: "DKK",
  vatRate: 0.25,
  trialDays: 30,
  plans: [
    { tier: "FREE", prices: null, limits: { children: 2, storageBytes: 500 * MB, invitableRoles: [], features: [] } },
    {
      tier: "PARENTS",
      prices: { MONTHLY: 3900, ANNUAL: 35100 },
      limits: { children: 3, storageBytes: 1 * GB, invitableRoles: ["PARENT", "GUARDIAN"], features: ["custodyPlanning", "mediaLibrary"] },
    },
    {
      tier: "FAMILY",
      prices: { MONTHLY: 6900, ANNUAL: 62100 },
      limits: {
        children: 6,
        storageBytes: 100 * GB,
        invitableRoles: ["PARENT", "GUARDIAN", "FAMILY"],
        features: ["custodyPlanning", "mediaLibrary", "circleMembers"],
      },
    },
  ],
};

const allAvailable = ["FREE", "PARENTS", "FAMILY"].map((tier) => ({ tier, available: true, reasons: [] }));

export const freeSub = {
  tier: "FREE",
  status: "ACTIVE",
  billingPeriod: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  trialExpired: false,
  trialAvailable: false,
  cardOnFile: false,
  lifetime: false,
  circle: null,
  storage: { usedBytes: 120 * MB, limitBytes: 500 * MB },
  tiers: allAvailable,
};

export const familySub = {
  ...freeSub,
  tier: "FAMILY",
  billingPeriod: "ANNUAL",
  currentPeriodEnd: "2027-10-12T07:00:00Z",
  cardOnFile: true,
  circle: { id: "sub-1", role: "OWNER", tier: "FAMILY", ownerName: "Charlie Nielsen", childCount: 3, members: [], pendingInvites: [] },
  storage: { usedBytes: 3 * GB, limitBytes: 100 * GB },
};
