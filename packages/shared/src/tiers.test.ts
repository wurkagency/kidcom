import { describe, expect, it } from "vitest";

import { TIER_PRICES_ORE, tierAtLeast, tierBlockReasons, tierForFeature, tierForRole, type TierUsage } from "./tiers";

const none: TierUsage = { children: 0, invitedRoles: {}, circleMembers: 0, storageBytes: 0, featuresInUse: [] };

describe("tier catalogue", () => {
  it("prices yearly at 25% off twelve months (D7)", () => {
    expect(TIER_PRICES_ORE.PARENTS).toEqual({ MONTHLY: 3900, ANNUAL: 35100 });
    expect(TIER_PRICES_ORE.FAMILY).toEqual({ MONTHLY: 6900, ANNUAL: 62100 });
  });

  it("orders tiers and maps roles and features to the lowest tier that allows them", () => {
    expect(tierAtLeast("FAMILY", "PARENTS")).toBe(true);
    expect(tierAtLeast("FREE", "PARENTS")).toBe(false);
    expect(tierForRole("PARENT")).toBe("PARENTS");
    expect(tierForRole("GUARDIAN")).toBe("PARENTS");
    expect(tierForRole("FAMILY")).toBe("FAMILY");
    expect(tierForFeature("custodyPlanning")).toBe("PARENTS");
    expect(tierForFeature("circleMembers")).toBe("FAMILY");
  });

  it("explains why a tier can't hold what's in use", () => {
    const usage: TierUsage = {
      children: 3,
      invitedRoles: { PARENT: 1, FAMILY: 2 },
      circleMembers: 1,
      storageBytes: 600 * 1024 * 1024,
      featuresInUse: ["custodyPlanning"],
    };
    expect(tierBlockReasons("FREE", usage).map((r) => r.code).sort()).toEqual(
      ["CHILDREN", "CIRCLE_MEMBERS", "FEATURE", "ROLE", "ROLE", "STORAGE"].sort()
    );
    expect(tierBlockReasons("PARENTS", usage).map((r) => r.code).sort()).toEqual(["CIRCLE_MEMBERS", "ROLE"]);
    expect(tierBlockReasons("FAMILY", usage)).toEqual([]);
    expect(tierBlockReasons("FREE", none)).toEqual([]);
  });
});
