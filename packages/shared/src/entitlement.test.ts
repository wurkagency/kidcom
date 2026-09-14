import { describe, it, expect } from "vitest";

import { tierAtLeast, requiredTier, effectiveCoverageTier, isSatisfied, satisfyingOwnerIds, type ChildMember, type OwnerEntitlementData } from "./entitlement";

describe("tierAtLeast", () => {
  it("orders FREE < PARENTS < FAMILY", () => {
    expect(tierAtLeast("FREE", "FREE")).toBe(true);
    expect(tierAtLeast("FREE", "PARENTS")).toBe(false);
    expect(tierAtLeast("PARENTS", "FREE")).toBe(true);
    expect(tierAtLeast("PARENTS", "FAMILY")).toBe(false);
    expect(tierAtLeast("FAMILY", "FAMILY")).toBe(true);
    expect(tierAtLeast("FAMILY", "PARENTS")).toBe(true);
  });
});

describe("requiredTier — spec §2.2 def. 3", () => {
  it("a single adult on their own -> FREE", () => {
    const members: ChildMember[] = [{ userId: "a", role: "PARENT" }];
    expect(requiredTier(members, "a")).toBe("FREE");
  });

  it("two PARENT members -> PARENTS", () => {
    const members: ChildMember[] = [
      { userId: "a", role: "PARENT" },
      { userId: "b", role: "PARENT" },
    ];
    expect(requiredTier(members, "a")).toBe("PARENTS");
    expect(requiredTier(members, "b")).toBe("PARENTS");
  });

  it("any FAMILY-role member -> FAMILY, regardless of whose perspective", () => {
    const members: ChildMember[] = [
      { userId: "a", role: "PARENT" },
      { userId: "b", role: "FAMILY" },
    ];
    expect(requiredTier(members, "a")).toBe("FAMILY");
  });

  it("9.18 carve-out: a lone GUARDIAN covering their own child on their own plan does not trigger FAMILY for themselves", () => {
    const members: ChildMember[] = [{ userId: "guardian", role: "GUARDIAN" }];
    expect(requiredTier(members, "guardian")).toBe("FREE");
  });

  it("9.18: the same lone-guardian child's requiredTier is FAMILY from a different candidate's perspective", () => {
    const members: ChildMember[] = [
      { userId: "guardian", role: "GUARDIAN" },
      { userId: "someone-else", role: "PARENT" },
    ];
    // From someone-else's perspective, the guardian IS "other than the
    // covering subscription's own owner" -> FAMILY.
    expect(requiredTier(members, "someone-else")).toBe("FAMILY");
    // From the guardian's own perspective, they're excluded from their own
    // count -> only 1 other member (someone-else, a PARENT) -> PARENTS, not
    // FAMILY, since no OTHER guardian and no FAMILY-role member exists.
    expect(requiredTier(members, "guardian")).toBe("PARENTS");
  });

  it("9.17/9.19: a second GUARDIAN (not the candidate) triggers FAMILY even with only 2 total members", () => {
    const members: ChildMember[] = [
      { userId: "parent", role: "PARENT" },
      { userId: "guardian", role: "GUARDIAN" },
    ];
    expect(requiredTier(members, "parent")).toBe("FAMILY");
  });
});

describe("effectiveCoverageTier", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("an active trial overrides to FAMILY regardless of the actual subscription", () => {
    const data: OwnerEntitlementData = {
      subscription: { tier: "FREE", status: "ACTIVE" },
      trialEndsAt: new Date("2026-07-01T00:00:00Z"),
    };
    expect(effectiveCoverageTier(now, data)).toBe("FAMILY");
  });

  it("an expired trial falls through to the real subscription", () => {
    const data: OwnerEntitlementData = {
      subscription: { tier: "PARENTS", status: "ACTIVE" },
      trialEndsAt: new Date("2026-01-01T00:00:00Z"),
    };
    expect(effectiveCoverageTier(now, data)).toBe("PARENTS");
  });

  it("no trial, active subscription -> the subscription's real tier", () => {
    const data: OwnerEntitlementData = { subscription: { tier: "FAMILY", status: "ACTIVE" }, trialEndsAt: null };
    expect(effectiveCoverageTier(now, data)).toBe("FAMILY");
  });

  it("PENDING/PAST_DUE/CANCELED never count, regardless of tier (preserves the as-built effectiveTier property)", () => {
    for (const status of ["PENDING", "PAST_DUE", "CANCELED"] as const) {
      const data: OwnerEntitlementData = { subscription: { tier: "FAMILY", status }, trialEndsAt: null };
      expect(effectiveCoverageTier(now, data)).toBe("FREE");
    }
  });

  it("no subscription at all -> FREE", () => {
    expect(effectiveCoverageTier(now, { subscription: null, trialEndsAt: null })).toBe("FREE");
  });
});

describe("isSatisfied — spec §2.2 def. 4", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("FAMILY-role members never cover anything (Consequence 1) even with an active Family subscription", () => {
    const members: ChildMember[] = [{ userId: "aunt", role: "FAMILY" }];
    const ownerData: Record<string, OwnerEntitlementData> = {
      aunt: { subscription: { tier: "FAMILY", status: "ACTIVE" }, trialEndsAt: null },
    };
    expect(isSatisfied(members, ownerData, now)).toBe(false);
  });

  it("a PARENT with an active Parents subscription satisfies a 2-adult (PARENTS-required) child", () => {
    const members: ChildMember[] = [
      { userId: "mom", role: "PARENT" },
      { userId: "dad", role: "PARENT" },
    ];
    const ownerData: Record<string, OwnerEntitlementData> = {
      mom: { subscription: { tier: "PARENTS", status: "ACTIVE" }, trialEndsAt: null },
    };
    expect(isSatisfied(members, ownerData, now)).toBe(true);
  });

  it("a PARENT on FREE tier does not satisfy a FAMILY-required child (extended family present)", () => {
    const members: ChildMember[] = [
      { userId: "mom", role: "PARENT" },
      { userId: "grandma", role: "FAMILY" },
    ];
    const ownerData: Record<string, OwnerEntitlementData> = {
      mom: { subscription: { tier: "FREE", status: "ACTIVE" }, trialEndsAt: null },
    };
    expect(isSatisfied(members, ownerData, now)).toBe(false);
  });

  it("no owner data for any coverer -> not satisfied", () => {
    const members: ChildMember[] = [{ userId: "mom", role: "PARENT" }];
    expect(isSatisfied(members, {}, now)).toBe(false);
  });

  it("satisfyingOwnerIds lists only the coverers whose own tier actually meets the bar", () => {
    const members: ChildMember[] = [
      { userId: "mom", role: "PARENT" },
      { userId: "dad", role: "PARENT" },
      { userId: "aunt", role: "FAMILY" },
    ];
    const ownerData: Record<string, OwnerEntitlementData> = {
      mom: { subscription: { tier: "FAMILY", status: "ACTIVE" }, trialEndsAt: null },
      dad: { subscription: { tier: "FREE", status: "ACTIVE" }, trialEndsAt: null },
      aunt: { subscription: { tier: "FAMILY", status: "ACTIVE" }, trialEndsAt: null },
    };
    // requiredTier is FAMILY here (aunt is FAMILY-role) — only mom's own
    // FAMILY-tier subscription clears that bar; dad's FREE doesn't; aunt is
    // never a candidate at all (FAMILY-role never covers).
    expect(satisfyingOwnerIds(members, ownerData, now)).toEqual(["mom"]);
  });
});
