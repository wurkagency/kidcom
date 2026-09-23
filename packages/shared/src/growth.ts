import { WHO_HEIGHT_BOYS, WHO_HEIGHT_GIRLS, type Lms } from "./whoHeightData";

// Height-for-age against the WHO reference (whoHeightData.ts): z-score,
// percentile, and the reference height at a given percentile, for ages
// 0–19 years. Children recorded as "OTHER" gender have no WHO reference, so
// every function returns null for them rather than guessing.

export type GrowthSex = "BOY" | "GIRL" | "OTHER";

const MAX_MONTHS = 228;

/** Age in fractional months between two dates (average month length). */
export function ageInMonths(birthday: string | Date, at: string | Date = new Date()): number {
  const ms = new Date(at).getTime() - new Date(birthday).getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

function lmsAt(sex: GrowthSex, months: number): Lms | null {
  const table = sex === "BOY" ? WHO_HEIGHT_BOYS : sex === "GIRL" ? WHO_HEIGHT_GIRLS : null;
  if (!table || !Number.isFinite(months) || months < 0 || months > MAX_MONTHS) return null;
  const lo = Math.floor(months);
  const hi = Math.min(MAX_MONTHS, lo + 1);
  const f = months - lo;
  const a = table[lo]!;
  const b = table[hi]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** WHO height-for-age z-score, or null outside 0–19 years / without a reference. */
export function heightZScore(sex: GrowthSex, months: number, heightCm: number): number | null {
  const lms = lmsAt(sex, months);
  if (!lms || !(heightCm > 0)) return null;
  const [l, m, s] = lms;
  return l === 0 ? Math.log(heightCm / m) / s : (Math.pow(heightCm / m, l) - 1) / (l * s);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const erf =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Percentile (0–100) of a height for age and sex. */
export function heightPercentile(sex: GrowthSex, months: number, heightCm: number): number | null {
  const z = heightZScore(sex, months, heightCm);
  return z === null ? null : normalCdf(z) * 100;
}

/** Inverse normal CDF (Acklam's rational approximation). */
function normalInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) return -normalInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** The reference height (cm) at a percentile for age and sex — for chart bands. */
export function heightAtPercentile(sex: GrowthSex, months: number, percentile: number): number | null {
  const lms = lmsAt(sex, months);
  if (!lms || percentile <= 0 || percentile >= 100) return null;
  const [l, m, s] = lms;
  const z = normalInv(percentile / 100);
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}
