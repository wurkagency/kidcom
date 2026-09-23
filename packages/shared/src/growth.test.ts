import { describe, it, expect } from "vitest";

import { ageInMonths, heightAtPercentile, heightPercentile, heightZScore, normalCdf } from "./growth";

// Spot checks against the WHO tables' published values.
describe("WHO height-for-age", () => {
  it("puts the WHO median at the 50th percentile", () => {
    expect(heightPercentile("BOY", 120, 137.7795)).toBeCloseTo(50, 3); // boys, 10 years
    expect(heightPercentile("GIRL", 60, 109.4233)).toBeCloseTo(50, 3); // girls, 5 years
    expect(heightPercentile("BOY", 0, 49.8842)).toBeCloseTo(50, 3); // birth
  });

  it("matches the published ±2 SD heights", () => {
    // Boys 10y: M 137.7795, S 0.04626 → +2 SD = M·(1 + 2S) ≈ 150.53
    expect(heightZScore("BOY", 120, 137.7795 * (1 + 2 * 0.04626))).toBeCloseTo(2, 3);
    expect(normalCdf(2) * 100).toBeCloseTo(97.72, 1);
    expect(heightAtPercentile("BOY", 120, 50)).toBeCloseTo(137.78, 1);
    expect(heightAtPercentile("BOY", 120, 97.725)).toBeCloseTo(150.53, 0);
  });

  it("interpolates between months and stays within 0–19 years", () => {
    const mid = heightAtPercentile("GIRL", 60.5, 50)!;
    expect(mid).toBeGreaterThan(heightAtPercentile("GIRL", 60, 50)!);
    expect(mid).toBeLessThan(heightAtPercentile("GIRL", 61, 50)!);
    expect(heightPercentile("BOY", 229, 180)).toBeNull();
    expect(heightPercentile("OTHER", 60, 110)).toBeNull();
  });

  it("computes ages in months", () => {
    expect(ageInMonths("2015-07-31", "2026-07-31")).toBeCloseTo(132, 0);
  });
});
