import type { ChildGender, GrowthEntryDto } from "@kinnd/shared";
import { ageInMonths, heightAtPercentile, heightPercentile } from "@kinnd/shared";
import { useFormat, useT } from "@kinnd/core";

// The "Growth Trajectory" chart from kinnd_child_profile_1: the child's
// measured heights over age on the WHO height-for-age reference — dashed
// median and the 15th–85th percentile band — plus the latest percentile and
// the change over the last six months.

const W = 320;
const H = 110;
const PAD = 10;

export type GrowthSummary = {
  points: { months: number; heightCm: number; measuredAt: string }[];
  percentile: number | null;
  sixMonthGainCm: number | null;
  /** How much the percentile moved over those six months */
  percentileShift: number | null;
};

export function summarizeGrowth(entries: GrowthEntryDto[], birthday: string, gender: ChildGender): GrowthSummary {
  const points = entries
    .filter((e) => e.heightCm !== null)
    .map((e) => ({ months: ageInMonths(birthday, e.measuredAt), heightCm: e.heightCm!, measuredAt: e.measuredAt }))
    .filter((p) => p.months >= 0)
    .sort((a, b) => a.months - b.months);
  const last = points.at(-1);
  if (!last) return { points, percentile: null, sixMonthGainCm: null, percentileShift: null };
  // The measurement closest to six months before the latest one (at least 3 months back).
  const earlier = points
    .filter((p) => last.months - p.months >= 3)
    .sort((a, b) => Math.abs(last.months - 6 - a.months) - Math.abs(last.months - 6 - b.months))[0];
  const percentile = heightPercentile(gender, last.months, last.heightCm);
  const before = earlier ? heightPercentile(gender, earlier.months, earlier.heightCm) : null;
  return {
    points,
    percentile,
    sixMonthGainCm: earlier ? last.heightCm - earlier.heightCm : null,
    percentileShift: percentile !== null && before !== null ? percentile - before : null,
  };
}

export function GrowthChart({ summary, gender }: { summary: GrowthSummary; gender: ChildGender }) {
  const { t } = useT("children");
  const fmt = useFormat();
  const { points } = summary;
  if (points.length === 0) {
    return (
      <div className="relative w-full h-36 bg-surface-container-lowest/70 rounded-2xl p-3 flex items-center justify-center text-center">
        <p className="font-body-md text-body-md text-secondary">{t("growth.empty")}</p>
      </div>
    );
  }

  const first = points[0]!;
  const last = points.at(-1)!;
  // Show at least a year so a single measurement still has a curve around it.
  const minM = Math.max(0, Math.min(first.months, last.months - 12));
  const maxM = Math.max(last.months, minM + 12);
  const samples = Array.from({ length: 25 }, (_, i) => minM + ((maxM - minM) * i) / 24);
  const band = (p: number) => samples.map((m) => ({ m, h: heightAtPercentile(gender, m, p) }));
  const lo = band(15);
  const mid = band(50);
  const hi = band(85);
  const heights = [...points.map((p) => p.heightCm), ...lo.map((b) => b.h ?? NaN), ...hi.map((b) => b.h ?? NaN)].filter(Number.isFinite);
  const minH = Math.min(...heights) - 2;
  const maxH = Math.max(...heights) + 2;
  const x = (m: number) => PAD + ((m - minM) / (maxM - minM || 1)) * (W - PAD * 2);
  const y = (h: number) => H - PAD - ((h - minH) / (maxH - minH || 1)) * (H - PAD * 2);
  const path = (pts: { m: number; h: number | null }[]) =>
    pts.filter((p) => p.h !== null).map((p, i) => `${i ? "L" : "M"} ${x(p.m).toFixed(1)},${y(p.h!).toFixed(1)}`).join(" ");
  const hasReference = lo.some((b) => b.h !== null);
  const area = hasReference
    ? `${path(hi)} ${[...lo].reverse().filter((b) => b.h !== null).map((b) => `L ${x(b.m).toFixed(1)},${y(b.h!).toFixed(1)}`).join(" ")} Z`
    : "";

  // Axis: first measured age, the ages between, the latest age — as the export labels them.
  // Whole years over a long span; half years when the measurements sit close together.
  const step = maxM - minM >= 36 ? 12 : 6;
  const age = (months: number) => fmt.number(Math.round(months / step) * (step / 12));
  const firstAge = age(first.months);
  const lastAge = age(last.months);
  const middle = [...new Set(Array.from({ length: 3 }, (_, i) => age(minM + ((maxM - minM) * (i + 1)) / 4)))].filter((a) => a !== firstAge && a !== lastAge);

  return (
    <div className="relative w-full h-36 bg-surface-container-lowest/70 backdrop-blur-xs rounded-2xl p-3 flex flex-col justify-end">
      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("growth.chartLabel")}>
        <defs>
          <linearGradient id="growthArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#bcc9c5" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#bcc9c5" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {hasReference && <path d={area} fill="url(#growthArea)" />}
        {hasReference && <path d={path(mid)} fill="none" stroke="#bcc9c5" strokeDasharray="3 3" strokeWidth="1.5" />}
        <path
          d={points.map((p, i) => `${i ? "L" : "M"} ${x(p.months).toFixed(1)},${y(p.heightCm).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="#191c1c"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
        {points.slice(0, -1).map((p) => (
          <circle key={p.measuredAt} cx={x(p.months)} cy={y(p.heightCm)} fill="#191c1c" r="3" />
        ))}
        <circle cx={x(last.months)} cy={y(last.heightCm)} fill="#191c1c" r="5" />
        <circle cx={x(last.months)} cy={y(last.heightCm)} fill="#191c1c" opacity="0.2" r="8" />
      </svg>
      <div className="flex justify-between items-center pt-1 font-micro-meta text-micro-meta text-secondary px-1">
        <span>{t("growth.ageWithHeight", { age: firstAge, cm: fmt.number(Math.round(first.heightCm)) })}</span>
        {middle.map((a) => (
          <span key={a}>{t("growth.age", { age: a })}</span>
        ))}
        <span className="font-bold text-on-surface">{t("growth.ageWithHeight", { age: lastAge, cm: fmt.number(Math.round(last.heightCm)) })}</span>
      </div>
    </div>
  );
}

/** "Normal steady pace" vs a shift worth mentioning at the next check-up. */
export function paceKey(shift: number | null): "growth.pace.steady" | "growth.pace.faster" | "growth.pace.slower" | null {
  if (shift === null) return null;
  if (shift > 25) return "growth.pace.faster";
  if (shift < -25) return "growth.pace.slower";
  return "growth.pace.steady";
}
