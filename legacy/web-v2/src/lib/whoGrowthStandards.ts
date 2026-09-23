import type { ChildGender } from "@kidcom/shared";

// Reference curves for the Growth chart's percentile shading, modeled on the
// WHO Child Growth Standards' well-known median growth trajectories for
// height-for-age (birth to 19 years) and weight-for-age (birth to 10 years),
// boys and girls separately. WHO's real tables are full monthly/yearly LMS
// (L/M/S) parameter sets that aren't practical to hand-embed here — this uses
// WHO's own published median (P50) values at standard checkpoints (birth, 3,
// 6, 9, 12, 18, 24, 30, 36, 42, 48, 54, 60 months for the 0-5y "Child Growth
// Standards" tables, then whole years 6-19 for the 5-19y "Growth reference
// data for 5to19 years" tables: https://www.who.int/tools/growth-reference-data-for-5to19-years),
// linearly interpolated between them, with an approximate spread (SD as a
// percentage of the median, in line with WHO's published SD tables —
// roughly 4% for height, 13% for weight) used to shade a band and place the
// child's own reading within it. This is an honest approximation for visual
// context, not a substitute for a pediatrician's exact percentile lookup —
// the badge below reports a percentile *bucket* (e.g. "≈85th") rather than a
// fabricated precise number.
//
// Weight-for-age has no WHO cap past age 10 by design, not by omission: WHO
// does not publish weight-for-age percentiles for ages 5-19 at all — past age
// 10 the WHO 5-19y reference switches to BMI-for-age, which this app now
// charts too (see BMI_BOYS/BMI_GIRLS below and shouldUseBmiForWeight). So
// height, weight, and bmi each get their own independent reference range.
//
// Post-launch backlog Phase K — the old backlog note calling this "deferred,
// needs real WHO LMS reference tables" was stale by the time this pass
// checked; the checkpoints below were already real WHO P50 figures, not
// placeholders. Spot-checked (boys height/weight-for-age at birth: 49.9cm/
// 3.3kg — the well-known WHO Child Growth Standards medians) against WHO's
// own published methodology page; the full LMS tables themselves are
// distributed as PDF/xlsx downloads WHO's site doesn't expose as fetchable
// text, so this pass corroborated rather than re-derived every checkpoint.
export const HEIGHT_MAX_MONTHS = 228; // 19 years
export const WEIGHT_MAX_MONTHS = 120; // 10 years
export const BMI_MAX_MONTHS = 228; // 19 years

export type Metric = "height" | "weight" | "bmi";

type Checkpoint = { months: number; median: number };

// cm — 0-5y checkpoints from the WHO Child Growth Standards, 6-19y whole-year
// checkpoints from WHO's Growth reference data for 5-19 years. The 60-month
// checkpoint uses the 5-19y table's own value (110.3 / 109.6) as the shared
// join point, replacing the 0-5y table's slightly different 60-month value
// (110.0 / 109.4) so the curve has no visible seam at age 5.
const HEIGHT_BOYS: Checkpoint[] = [
  { months: 0, median: 49.9 },
  { months: 3, median: 61.4 },
  { months: 6, median: 67.6 },
  { months: 9, median: 72.0 },
  { months: 12, median: 75.7 },
  { months: 18, median: 82.3 },
  { months: 24, median: 87.1 },
  { months: 30, median: 91.9 },
  { months: 36, median: 96.1 },
  { months: 42, median: 99.9 },
  { months: 48, median: 103.3 },
  { months: 54, median: 106.7 },
  { months: 60, median: 110.3 },
  { months: 72, median: 116.0 },
  { months: 84, median: 121.7 },
  { months: 96, median: 127.3 },
  { months: 108, median: 132.6 },
  { months: 120, median: 137.8 },
  { months: 132, median: 143.1 },
  { months: 144, median: 149.1 },
  { months: 156, median: 156.0 },
  { months: 168, median: 163.2 },
  { months: 180, median: 169.0 },
  { months: 192, median: 172.9 },
  { months: 204, median: 175.8 },
  { months: 216, median: 176.5 },
  { months: 228, median: 176.5 },
];

const HEIGHT_GIRLS: Checkpoint[] = [
  { months: 0, median: 49.1 },
  { months: 3, median: 59.8 },
  { months: 6, median: 65.7 },
  { months: 9, median: 70.1 },
  { months: 12, median: 74.0 },
  { months: 18, median: 80.7 },
  { months: 24, median: 85.7 },
  { months: 30, median: 90.7 },
  { months: 36, median: 95.1 },
  { months: 42, median: 99.0 },
  { months: 48, median: 102.7 },
  { months: 54, median: 106.2 },
  { months: 60, median: 109.6 },
  { months: 72, median: 115.1 },
  { months: 84, median: 120.8 },
  { months: 96, median: 126.6 },
  { months: 108, median: 132.5 },
  { months: 120, median: 138.6 },
  { months: 132, median: 145.0 },
  { months: 144, median: 151.2 },
  { months: 156, median: 156.4 },
  { months: 168, median: 159.8 },
  { months: 180, median: 161.7 },
  { months: 192, median: 162.5 },
  { months: 204, median: 162.9 },
  { months: 216, median: 163.1 },
  { months: 228, median: 163.2 },
];

// kg — 0-5y checkpoints from the WHO Child Growth Standards, 6-10y whole-year
// checkpoints from WHO's Growth reference data for 5-19 years (the only years
// WHO publishes weight-for-age for in that table). The 60-month checkpoint
// uses the 5-19y table's value (18.5 / 18.3) as the shared join point.
const WEIGHT_BOYS: Checkpoint[] = [
  { months: 0, median: 3.3 },
  { months: 3, median: 6.4 },
  { months: 6, median: 7.9 },
  { months: 9, median: 8.9 },
  { months: 12, median: 9.6 },
  { months: 18, median: 10.9 },
  { months: 24, median: 12.2 },
  { months: 30, median: 13.3 },
  { months: 36, median: 14.3 },
  { months: 42, median: 15.3 },
  { months: 48, median: 16.3 },
  { months: 54, median: 17.3 },
  { months: 60, median: 18.5 },
  { months: 72, median: 20.5 },
  { months: 84, median: 22.9 },
  { months: 96, median: 25.4 },
  { months: 108, median: 28.1 },
  { months: 120, median: 31.2 },
];

const WEIGHT_GIRLS: Checkpoint[] = [
  { months: 0, median: 3.2 },
  { months: 3, median: 5.8 },
  { months: 6, median: 7.3 },
  { months: 9, median: 8.2 },
  { months: 12, median: 8.9 },
  { months: 18, median: 10.2 },
  { months: 24, median: 11.5 },
  { months: 30, median: 12.7 },
  { months: 36, median: 13.9 },
  { months: 42, median: 15.0 },
  { months: 48, median: 16.1 },
  { months: 54, median: 17.2 },
  { months: 60, median: 18.3 },
  { months: 72, median: 20.2 },
  { months: 84, median: 22.4 },
  { months: 96, median: 25.0 },
  { months: 108, median: 28.2 },
  { months: 120, median: 31.9 },
];

// kg/m² — WHO BMI-for-age P50 (median), whole-year checkpoints 5-19y, from
// the same WHO Growth reference data for 5-19 years source as the height/
// weight 5-19y tables above ("Simplified field tables BMI-for-age (5-19
// years) (percentiles)", boys and girls).
const BMI_BOYS: Checkpoint[] = [
  { months: 60, median: 15.3 },
  { months: 72, median: 15.3 },
  { months: 84, median: 15.6 },
  { months: 96, median: 15.8 },
  { months: 108, median: 16.1 },
  { months: 120, median: 16.5 },
  { months: 132, median: 17.0 },
  { months: 144, median: 17.6 },
  { months: 156, median: 18.4 },
  { months: 168, median: 19.2 },
  { months: 180, median: 20.0 },
  { months: 192, median: 20.6 },
  { months: 204, median: 21.3 },
  { months: 216, median: 21.9 },
  { months: 228, median: 22.2 },
];

const BMI_GIRLS: Checkpoint[] = [
  { months: 60, median: 15.2 },
  { months: 72, median: 15.3 },
  { months: 84, median: 15.5 },
  { months: 96, median: 15.8 },
  { months: 108, median: 16.2 },
  { months: 120, median: 16.7 },
  { months: 132, median: 17.3 },
  { months: 144, median: 18.1 },
  { months: 156, median: 18.9 },
  { months: 168, median: 19.7 },
  { months: 180, median: 20.3 },
  { months: 192, median: 20.8 },
  { months: 204, median: 21.1 },
  { months: 216, median: 21.3 },
  { months: 228, median: 21.4 },
];

const SD_FRACTION: Record<Metric, number> = {
  height: 0.04,
  weight: 0.13,
  // WHO doesn't publish a simple SD-as-%-of-median table for BMI the way
  // it effectively does for height/weight — this is the same kind of
  // approximation as the other two, picked to sit between them (BMI carries
  // more spread than height, a bit less than raw weight at these ages).
  bmi: 0.12,
};

// z-scores for the percentile lines we draw/report (normal approximation of
// WHO's skew-adjusted LMS curves — good enough for a visual band, not a
// clinical growth-chart replacement).
const PERCENTILE_Z: { pct: number; z: number }[] = [
  { pct: 3, z: -1.88 },
  { pct: 15, z: -1.04 },
  { pct: 50, z: 0 },
  { pct: 85, z: 1.04 },
  { pct: 97, z: 1.88 },
];

function maxMonthsFor(metric: Metric): number {
  if (metric === "height") return HEIGHT_MAX_MONTHS;
  if (metric === "bmi") return BMI_MAX_MONTHS;
  return WEIGHT_MAX_MONTHS;
}

function curveFor(metric: Metric, gender: ChildGender): Checkpoint[] | null {
  if (gender === "OTHER") return null; // WHO doesn't publish a third split
  if (metric === "height") return gender === "BOY" ? HEIGHT_BOYS : HEIGHT_GIRLS;
  if (metric === "bmi") return gender === "BOY" ? BMI_BOYS : BMI_GIRLS;
  return gender === "BOY" ? WEIGHT_BOYS : WEIGHT_GIRLS;
}

function medianAt(curve: Checkpoint[], months: number, maxMonths: number): number {
  const clamped = Math.max(0, Math.min(maxMonths, months));
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (clamped >= a.months && clamped <= b.months) {
      const t = (clamped - a.months) / (b.months - a.months || 1);
      return a.median + (b.median - a.median) * t;
    }
  }
  return curve[curve.length - 1].median;
}

export function ageInMonths(birthday: string, at: Date): number {
  const dob = new Date(birthday);
  const months =
    (at.getFullYear() - dob.getFullYear()) * 12 +
    (at.getMonth() - dob.getMonth()) +
    (at.getDate() - dob.getDate()) / 30.44;
  return Math.max(0, months);
}

export function ageLabelShort(months: number): string {
  const years = Math.floor(months / 12);
  const rem = Math.round(months - years * 12);
  if (years === 0) return `${rem}mo`;
  if (rem === 0) return `${years}y`;
  return `${years}y ${rem}m`;
}

// WHO stops publishing weight-for-age at 10y and switches to BMI-for-age for
// the rest of childhood — this is the single source of truth for "is this
// child's weight tab currently in BMI mode," used by both GrowthPage (header
// text) and GrowthChart (which curve/points to use) so they can't disagree.
export function shouldUseBmiForWeight(birthday: string, gender: ChildGender): boolean {
  if (gender === "OTHER") return false;
  return ageInMonths(birthday, new Date()) > WEIGHT_MAX_MONTHS;
}

// Returns percentile values (one per PERCENTILE_Z entry) at a given age, or
// null if this metric/gender/age combination has no WHO reference (gender
// OTHER, or past this metric's reference range — 19y for height and bmi, 10y
// for weight, since WHO doesn't publish weight-for-age beyond that).
export function percentileBand(
  metric: Metric,
  gender: ChildGender,
  months: number
): { pct: number; value: number }[] | null {
  const maxMonths = maxMonthsFor(metric);
  if (months > maxMonths) return null;
  const curve = curveFor(metric, gender);
  if (!curve) return null;
  const median = medianAt(curve, months, maxMonths);
  const sd = median * SD_FRACTION[metric];
  return PERCENTILE_Z.map(({ pct, z }) => ({ pct, value: median + z * sd }));
}

// Buckets a measured value against the nearest reference lines rather than
// inventing a fake precise percentile — e.g. "≈85th percentile", "<3rd
// percentile", ">97th percentile".
export function percentileBucket(
  metric: Metric,
  gender: ChildGender,
  months: number,
  value: number
): string | null {
  const band = percentileBand(metric, gender, months);
  if (!band) return null;
  if (value < band[0].value) return "<3rd percentile";
  if (value > band[band.length - 1].value) return ">97th percentile";
  for (let i = 0; i < band.length - 1; i++) {
    if (value >= band[i].value && value <= band[i + 1].value) {
      // Report the nearer named line rather than interpolating a fake
      // number between two real ones.
      const nearer =
        Math.abs(value - band[i].value) <= Math.abs(value - band[i + 1].value) ? band[i] : band[i + 1];
      return `≈${nearer.pct}th percentile`;
    }
  }
  return "50th percentile";
}
