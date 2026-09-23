import type { ChildFamilyMember, CustodyPlanDto } from "@kidcom/shared";

// Small labels for the child profile.

// EU children's clothing sizes are body heights in cm; the usual age for each.
const SIZE_AGE: [cm: number, years: number][] = [
  [50, 0], [56, 0], [62, 0], [68, 0.5], [74, 0.75], [80, 1], [86, 1.5], [92, 2], [98, 3], [104, 4], [110, 5],
  [116, 6], [122, 7], [128, 8], [134, 9], [140, 10], [146, 11], [152, 12], [158, 13], [164, 14], [170, 15], [176, 16],
];

/** "164 – 170" → { from: 14, to: 15 } years; null when the size isn't in cm. */
export function clothingAgeRange(size: string | null): { from: number; to: number } | null {
  const nums = (size?.match(/\d{2,3}/g) ?? []).map(Number).filter((n) => n >= 50 && n <= 188);
  if (!nums.length) return null;
  const ageOf = (cm: number) => SIZE_AGE.reduce((best, cur) => (Math.abs(cur[0] - cm) < Math.abs(best[0] - cm) ? cur : best))[1];
  const ages = nums.map(ageOf);
  return { from: Math.floor(Math.min(...ages)), to: Math.ceil(Math.max(...ages)) };
}

/** The parents' and guardians' first names: "Anna • Charlie". */
export function parentNames(members: ChildFamilyMember[] | undefined): string {
  return (members ?? [])
    .filter((m) => m.role !== "FAMILY")
    .map((m) => m.firstName)
    .join(" • ");
}

/** "7/7" from the plan's blocks; "2/2/3/2/2/3" etc. for other rhythms. */
export function custodyRhythm(plan: CustodyPlanDto): string {
  return plan.patternDays.blocks.map((b) => b.days).join("/");
}

/** The weekday of the plan's first handover (its start date). */
export function handoverWeekday(plan: CustodyPlanDto): Date {
  return new Date(`${plan.startDate.slice(0, 10)}T12:00:00Z`);
}
