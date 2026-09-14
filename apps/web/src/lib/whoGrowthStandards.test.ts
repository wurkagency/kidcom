import { describe, it, expect } from "vitest";

import { percentileBand, percentileBucket, shouldUseBmiForWeight } from "./whoGrowthStandards";

// Post-launch backlog Phase K — validation pass on the already-implemented
// WHO percentile overlay (the old backlog note calling this "deferred,
// needs real WHO LMS reference tables" was stale — this file already embeds
// WHO's own published P50 checkpoints for height/weight/BMI, boys and
// girls, sourced and cited directly in whoGrowthStandards.ts's own header
// comment). These are the well-known WHO Child Growth Standards median
// figures (birth boys length-for-age 49.9cm, birth boys weight-for-age
// 3.3kg) that appear throughout pediatric references — proof the embedded
// checkpoints and the lookup/bucketing logic built on them behave
// correctly, not a re-derivation of WHO's own tables.
describe("whoGrowthStandards (Phase K validation pass)", () => {
  it("the median (50th percentile) line at a known WHO checkpoint matches the embedded reference value exactly", () => {
    const band = percentileBand("height", "BOY", 0);
    expect(band).not.toBeNull();
    const median = band!.find((b) => b.pct === 50);
    expect(median?.value).toBe(49.9); // WHO boys length-for-age median at birth
  });

  it("girls and boys use distinct reference curves at the same age", () => {
    const boys = percentileBand("weight", "BOY", 0)!.find((b) => b.pct === 50)!.value;
    const girls = percentileBand("weight", "GIRL", 0)!.find((b) => b.pct === 50)!.value;
    expect(boys).toBe(3.3);
    expect(girls).toBe(3.2);
    expect(boys).not.toBe(girls);
  });

  it("linearly interpolates between checkpoints rather than only returning exact checkpoint values", () => {
    // Halfway between the 0mo (49.9) and 3mo (61.4) boys height checkpoints.
    const band = percentileBand("height", "BOY", 1.5)!;
    const median = band.find((b) => b.pct === 50)!.value;
    expect(median).toBeCloseTo((49.9 + 61.4) / 2, 5);
  });

  it("returns null past a metric's WHO-published age range (weight stops at 10y) rather than extrapolating", () => {
    expect(percentileBand("weight", "BOY", 121)).toBeNull(); // 1 month past WEIGHT_MAX_MONTHS
    expect(percentileBand("weight", "BOY", 119)).not.toBeNull();
  });

  it("returns null for gender OTHER — WHO doesn't publish a third split, and this doesn't fabricate one", () => {
    expect(percentileBand("height", "OTHER", 24)).toBeNull();
  });

  it("buckets a measured value to the nearer named percentile line instead of inventing a precise number", () => {
    // Exactly at the 50th-percentile checkpoint value.
    expect(percentileBucket("height", "BOY", 0, 49.9)).toBe("≈50th percentile");
    // Below the lowest published line (3rd percentile).
    expect(percentileBucket("height", "BOY", 0, 1)).toBe("<3rd percentile");
    // Above the highest published line (97th percentile).
    expect(percentileBucket("height", "BOY", 0, 200)).toBe(">97th percentile");
  });

  it("shouldUseBmiForWeight flips to true only past WHO's 10-year weight-for-age cutoff", () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 9);
    expect(shouldUseBmiForWeight(tenYearsAgo.toISOString(), "BOY")).toBe(false);

    const elevenYearsAgo = new Date();
    elevenYearsAgo.setFullYear(elevenYearsAgo.getFullYear() - 11);
    expect(shouldUseBmiForWeight(elevenYearsAgo.toISOString(), "BOY")).toBe(true);
  });
});
