import { describe, it, expect } from "vitest";

import { isValidEmail, relationshipTypeToRole, vatBreakdown } from "./index";

// Phase 0 proof that the packages/shared test harness works end to end
// (pure functions, no DB/HTTP). Exercises real existing exports rather than
// a throwaway placeholder — packages/shared/src/entitlement.ts (Phase 7)
// gets its own dedicated test file once it exists.
describe("isValidEmail", () => {
  it("accepts a well-formed address", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("relationshipTypeToRole", () => {
  it("maps FATHER/MOTHER/PARENT to PARENT", () => {
    expect(relationshipTypeToRole("FATHER")).toBe("PARENT");
    expect(relationshipTypeToRole("MOTHER")).toBe("PARENT");
    expect(relationshipTypeToRole("PARENT")).toBe("PARENT");
  });

  it("maps step/foster/guardian relationships to GUARDIAN (spec 9.17/9.17a)", () => {
    expect(relationshipTypeToRole("STEP_FATHER")).toBe("GUARDIAN");
    expect(relationshipTypeToRole("STEP_MOTHER")).toBe("GUARDIAN");
    expect(relationshipTypeToRole("FOSTER_FATHER")).toBe("GUARDIAN");
    expect(relationshipTypeToRole("FOSTER_MOTHER")).toBe("GUARDIAN");
    expect(relationshipTypeToRole("GUARDIAN")).toBe("GUARDIAN");
  });

  it("maps everything else to FAMILY", () => {
    expect(relationshipTypeToRole("GRANDMOTHER_MAT")).toBe("FAMILY");
    expect(relationshipTypeToRole("CAREGIVER")).toBe("FAMILY");
    expect(relationshipTypeToRole("OTHER")).toBe("FAMILY");
  });
});

// D9 (spec 9.14/§6.3): 29/59/275/559 DKK are the gross, VAT-inclusive prices
// already charged — these figures must match the spec's §6.3 table exactly,
// since that table is what the receipt email and checkout copy both quote.
describe("vatBreakdown", () => {
  it("derives the spec's monthly Parents figures (29 -> 23.20 net + 5.80 VAT)", () => {
    expect(vatBreakdown(2900)).toEqual({
      grossMinorUnits: 2900,
      netMinorUnits: 2320,
      vatMinorUnits: 580,
      vatRatePercent: 25,
    });
  });

  it("derives the spec's monthly Family figures (59 -> 47.20 net + 11.80 VAT)", () => {
    expect(vatBreakdown(5900)).toEqual({
      grossMinorUnits: 5900,
      netMinorUnits: 4720,
      vatMinorUnits: 1180,
      vatRatePercent: 25,
    });
  });

  it("derives the spec's annual Parents figures (275 -> 220.00 net + 55.00 VAT)", () => {
    expect(vatBreakdown(27500)).toEqual({
      grossMinorUnits: 27500,
      netMinorUnits: 22000,
      vatMinorUnits: 5500,
      vatRatePercent: 25,
    });
  });

  it("derives the spec's annual Family figures (559 -> 447.20 net + 111.80 VAT)", () => {
    expect(vatBreakdown(55900)).toEqual({
      grossMinorUnits: 55900,
      netMinorUnits: 44720,
      vatMinorUnits: 11180,
      vatRatePercent: 25,
    });
  });

  it("net + VAT always sums back to gross", () => {
    for (const gross of [2900, 5900, 27500, 55900, 100, 1]) {
      const { netMinorUnits, vatMinorUnits } = vatBreakdown(gross);
      expect(netMinorUnits + vatMinorUnits).toBe(gross);
    }
  });
});
