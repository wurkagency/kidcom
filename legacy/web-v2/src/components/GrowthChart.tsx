import type { ChildGender, GrowthEntryDto } from "@kidcom/shared";

import {
  ageInMonths,
  ageLabelShort,
  percentileBand,
  percentileBucket,
  shouldUseBmiForWeight,
  HEIGHT_MAX_MONTHS,
  WEIGHT_MAX_MONTHS,
  BMI_MAX_MONTHS,
  type Metric,
} from "../lib/whoGrowthStandards";
import { formatHeight, formatWeight, getUnitSystem } from "../lib/preferences";

// Inline SVG line chart matching the layout of
// docs/stitch_splitkid/growth_charts/code.html's "Height Chart" card,
// plotting the child's own logged GrowthEntry rows against an approximate
// WHO percentile band (see whoGrowthStandards.ts for what "approximate"
// means here and why). The x-axis is the child's age at each entry (matches
// the mockup's "Age 3 / Age 4 / Age 5" labels) rather than a raw calendar
// date.
export function GrowthChart({
  entries,
  metric,
  child,
}: {
  entries: GrowthEntryDto[];
  metric: "height" | "weight";
  child: { birthday: string; gender: ChildGender };
}) {
  // WHO stops publishing weight-for-age at 10y — once the child is currently
  // past that, the "Weight" tab switches to BMI-for-age instead (still WHO,
  // just a different indicator), same single source of truth GrowthPage uses
  // for its header text.
  const effectiveMetric: Metric =
    metric === "weight" && shouldUseBmiForWeight(child.birthday, child.gender) ? "bmi" : metric;

  const points = entries
    .map((e) => ({
      ageMonths: ageInMonths(child.birthday, new Date(e.measuredAt)),
      value:
        effectiveMetric === "height"
          ? e.heightCm
          : effectiveMetric === "bmi"
            ? // BMI only exists for entries with both fields on the same log —
              // no guessing a paired height from a different entry.
              e.heightCm != null && e.weightKg != null
              ? e.weightKg / (e.heightCm / 100) ** 2
              : null
            : e.weightKg,
    }))
    .filter((p): p is { ageMonths: number; value: number } => p.value !== null && p.value !== undefined)
    .sort((a, b) => a.ageMonths - b.ageMonths);

  if (points.length === 0) {
    return (
      <div className="p-4 h-64 w-full bg-surface/30 flex items-center justify-center">
        <p className="font-body-md text-body-md text-on-surface-variant text-center">
          Log a measurement to see the chart.
        </p>
      </div>
    );
  }

  const singlePoint = points.length === 1;
  const minAge = points[0].ageMonths;
  const maxAge = points[points.length - 1].ageMonths;
  const ageSpan = maxAge - minAge || 1;

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const height = 150;
  const padding = 15;
  // Give the chart more horizontal room as points pile up (roughly one
  // "comfortable" slot per point) instead of cramming everything into a
  // fixed width — the wrapper below scrolls once this exceeds its box.
  const width = Math.max(300, points.length * 48);

  const last = points[points.length - 1];
  const units = getUnitSystem();
  const formattedLast =
    effectiveMetric === "height"
      ? formatHeight(last.value, units)
      : effectiveMetric === "bmi"
        ? `BMI ${last.value.toFixed(1)}`
        : formatWeight(last.value, units);

  // WHO band, sampled across the same age range as the logged entries
  // (clamped to this metric's reference range — 19y for height and bmi, 10y
  // for weight, since WHO doesn't publish weight-for-age past 10y) so it
  // stretches to the same dynamic width as the child's own line.
  const metricMaxMonths =
    effectiveMetric === "height" ? HEIGHT_MAX_MONTHS : effectiveMetric === "bmi" ? BMI_MAX_MONTHS : WEIGHT_MAX_MONTHS;
  const bandStartAge = Math.max(0, minAge);
  const bandEndAge = Math.min(metricMaxMonths, Math.max(maxAge, minAge + 1));
  const showBand = bandStartAge < metricMaxMonths && child.gender !== "OTHER";
  const SAMPLE_STEPS = 20;
  const bandSamples = showBand
    ? Array.from({ length: SAMPLE_STEPS + 1 }, (_, i) => {
        const age = bandStartAge + ((bandEndAge - bandStartAge) * i) / SAMPLE_STEPS;
        return { age, band: percentileBand(effectiveMetric, child.gender, age) };
      }).filter((s): s is { age: number; band: NonNullable<ReturnType<typeof percentileBand>> } => s.band !== null)
    : [];

  // Value range needs to cover both the child's own readings and the WHO
  // band (if shown) so neither gets clipped.
  const bandValues = bandSamples.flatMap((s) => s.band.map((b) => b.value));
  const allValues = [...values, ...bandValues];
  const rangeMin = Math.min(...allValues);
  const rangeMax = Math.max(...allValues);
  const valueSpan = rangeMax - rangeMin || 1;

  function ageToX(age: number) {
    return singlePoint ? width / 2 : padding + ((age - minAge) / ageSpan) * (width - padding * 2);
  }
  function valueToY(value: number) {
    return height - padding - ((value - rangeMin) / valueSpan) * (height - padding * 2);
  }

  const coords = points.map((p) => ({ x: ageToX(p.ageMonths), y: valueToY(p.value) }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const lastCoord = coords[coords.length - 1];

  // Outer (3rd–97th) and inner (15th–85th) shaded bands as filled paths —
  // top edge forward, bottom edge back, matching the mockup's approach.
  function bandPath(loPct: number, hiPct: number): string | null {
    if (bandSamples.length < 2) return null;
    const top = bandSamples.map((s) => {
      const entry = s.band.find((b) => b.pct === hiPct)!;
      return { x: ageToX(s.age), y: valueToY(entry.value) };
    });
    const bottom = bandSamples.map((s) => {
      const entry = s.band.find((b) => b.pct === loPct)!;
      return { x: ageToX(s.age), y: valueToY(entry.value) };
    });
    const forward = top.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const back = [...bottom].reverse().map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    return `${forward} ${back} Z`;
  }
  const outerBand = bandPath(3, 97);
  const innerBand = bandPath(15, 85);

  // Subtle dotted WHO median (50th percentile) line running through the
  // shaded band, so there's an explicit line to compare the child's own
  // solid line against rather than just the translucent fill.
  const medianLinePath =
    bandSamples.length >= 2
      ? bandSamples
          .map((s, i) => {
            const entry = s.band.find((b) => b.pct === 50)!;
            const c = { x: ageToX(s.age), y: valueToY(entry.value) };
            return `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  const bucket = showBand ? percentileBucket(effectiveMetric, child.gender, last.ageMonths, last.value) : null;

  const badgeLeftPct = Math.min(92, Math.max(8, (lastCoord.x / width) * 100));
  const badgeTopPct = Math.min(85, Math.max(5, (lastCoord.y / height) * 100 - 12));

  // Show an age tick under every point when there's enough room, thinning
  // to first/last only once points would start to overlap.
  const showAllTicks = width / points.length >= 40;

  return (
    <div className="relative">
      <div
        className="p-4 h-64 w-full bg-surface/30 overflow-x-auto snap-x snap-mandatory"
        style={
          width > 300
            ? { maskImage: "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)" }
            : undefined
        }
      >
        <div className="relative h-full" style={{ width, minWidth: "100%" }}>
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
            <line stroke="rgb(var(--color-outline-variant))" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.8} y2={height * 0.8} />
            <line stroke="rgb(var(--color-outline-variant))" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.6} y2={height * 0.6} />
            <line stroke="rgb(var(--color-outline-variant))" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.4} y2={height * 0.4} />
            <line stroke="rgb(var(--color-outline-variant))" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.2} y2={height * 0.2} />

            {outerBand && <path d={outerBand} fill="rgb(var(--color-primary))" opacity="0.12" />}
            {innerBand && <path d={innerBand} fill="rgb(var(--color-primary))" opacity="0.22" />}
            {medianLinePath && (
              <path
                d={medianLinePath}
                fill="none"
                stroke="rgb(var(--color-on-surface-variant))"
                strokeWidth="1.25"
                strokeDasharray="3 3"
                opacity="0.55"
              />
            )}

            <path d={linePath} fill="none" stroke="rgb(var(--color-primary))" strokeLinecap="round" strokeWidth="3" />

            {coords.slice(0, -1).map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} fill="rgb(var(--color-surface-container-lowest))" r="4" stroke="rgb(var(--color-primary))" strokeWidth="2" />
            ))}
            <circle cx={lastCoord.x} cy={lastCoord.y} fill="rgb(var(--color-primary))" r="6" stroke="rgb(var(--color-surface-container-lowest))" strokeWidth="2" />

            {points.map((p, i) => {
              if (!showAllTicks && i !== 0 && i !== points.length - 1) return null;
              const x = ageToX(p.ageMonths);
              const anchor = i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
              return (
                <text
                  key={i}
                  fill="rgb(var(--color-on-surface-variant))"
                  fontFamily="var(--font-heading)"
                  fontSize="10"
                  x={x}
                  y={height - 5}
                  textAnchor={anchor}
                >
                  {ageLabelShort(p.ageMonths)}
                </text>
              );
            })}
          </svg>
          <div
            className="absolute bg-on-surface text-surface-container-lowest px-2 py-1 rounded-lg shadow-md font-label-sm flex items-center gap-1"
            style={{ left: `${badgeLeftPct}%`, top: `${badgeTopPct}%` }}
          >
            <span>{formattedLast}</span>
            {bucket && <span className="text-inverse-primary text-[10px]">{bucket}</span>}
          </div>
        </div>
      </div>
      {!showBand && (
        <p className="font-label-sm text-label-sm text-on-surface-variant px-4 pb-3">
          {child.gender === "OTHER"
            ? "WHO reference charts are only published as boy/girl percentiles."
            : effectiveMetric === "bmi"
              ? "WHO BMI-for-age percentiles are available up to age 19."
              : "WHO height percentiles are available up to age 19."}
        </p>
      )}
    </div>
  );
}
