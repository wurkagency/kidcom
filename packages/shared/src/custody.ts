// Custody schedule is computed, not stored — see the chunk 4 plan notes on
// CustodyPlan in packages/db/prisma/schema.prisma. A repeating pattern
// (7/7, 2-2-3, etc.) is fully determined by its rule + start date, so who
// has the child on any given day is a pure function of (pattern, date).
// This lives in packages/shared so the same logic can run client-side too
// (e.g. rendering the calendar strip without waiting on a round trip).

export type CustodyBlock = {
  userId: string;
  days: number;
};

export type CustodyPattern = {
  cycleLengthDays: number;
  blocks: CustodyBlock[];
};

export type CustodyPlanLike = {
  startDate: string | Date;
  patternDays: CustodyPattern;
};

function toUtcDayStart(date: string | Date): number {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Shared cycle-walk used by both resolveCustodyForDate and
// resolveCustodyBlockProgress below, so the two can never drift apart.
// Returns null under the same "no answer" conditions resolveCustodyForDate
// documents (malformed pattern, or date before the plan starts).
function locateBlock(
  plan: CustodyPlanLike,
  date: string | Date
): { block: CustodyBlock; dayOfBlock: number } | null {
  const { cycleLengthDays, blocks } = plan.patternDays;
  if (!cycleLengthDays || !blocks || blocks.length === 0) return null;

  const startDay = toUtcDayStart(plan.startDate);
  const targetDay = toUtcDayStart(date);
  const dayIndex = Math.floor((targetDay - startDay) / (24 * 60 * 60 * 1000));
  if (dayIndex < 0) return null;

  const positionInCycle = dayIndex % cycleLengthDays;
  let cursor = 0;
  for (const block of blocks) {
    if (positionInCycle < cursor + block.days) {
      return { block, dayOfBlock: positionInCycle - cursor + 1 }; // 1-indexed
    }
    cursor += block.days;
  }
  // Blocks don't add up to cycleLengthDays — treat the remainder as
  // belonging to the last block rather than throwing (matches
  // resolveCustodyForDate's existing fallback behavior).
  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock) return null;
  return { block: lastBlock, dayOfBlock: positionInCycle - cursor + 1 };
}

// Returns the userId who has the child on `date`, or null if `date` is
// before the plan's startDate or the pattern is malformed (empty blocks /
// zero cycle length).
export function resolveCustodyForDate(plan: CustodyPlanLike, date: string | Date): string | null {
  return locateBlock(plan, date)?.block.userId ?? null;
}

export type CustodyBlockProgress = {
  userId: string;
  // 1-indexed day-of-block, e.g. "Day 4 of 7".
  dayOfBlock: number;
  blockLengthDays: number;
};

// Powers the Week view's "Dad's Full Week Rotation — Day 4 of 7" banner —
// same cycle-walk as resolveCustodyForDate, just also reporting where `date`
// falls within its block instead of only who has the child.
export function resolveCustodyBlockProgress(
  plan: CustodyPlanLike,
  date: string | Date
): CustodyBlockProgress | null {
  const located = locateBlock(plan, date);
  if (!located) return null;
  return {
    userId: located.block.userId,
    dayOfBlock: located.dayOfBlock,
    blockLengthDays: located.block.days,
  };
}

// True when `dateIso` and the day before it belong to different custody
// owners — powers the List view's "Custody Handover Day" badge.
// `custodyByDate` is the same "YYYY-MM-DD" -> userId map the calendar range
// endpoint already returns, so no extra pattern-walking is needed here.
export function isCustodyHandoverDay(
  custodyByDate: Record<string, string | null>,
  dateIso: string
): boolean {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const prevDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const prevIso = prevDate.toISOString().slice(0, 10);
  const today = custodyByDate[dateIso] ?? null;
  const prev = prevIso in custodyByDate ? custodyByDate[prevIso] ?? null : undefined;
  if (prev === undefined || today === null) return false;
  return prev !== null && prev !== today;
}

// Two built-in presets offered by the CustodySetup UI. `blockDayCounts` is
// the sequence of block lengths, alternating parent A/B/A/B/…; the caller
// fills in the two parents' actual userIds in that order. 2-2-3 alternates
// which parent gets the 3-day (weekend) block each week, so it needs the
// full 14-day cycle spelled out rather than a naive 7-day repeat.
export const CUSTODY_PRESETS = {
  WEEK_ON_WEEK_OFF: { label: "Week on/week off", cycleLengthDays: 14, blockDayCounts: [7, 7] },
  TWO_TWO_THREE: {
    label: "2-2-3",
    cycleLengthDays: 14,
    blockDayCounts: [2, 2, 3, 2, 2, 3],
  },
  // Sums to 14 and alternates A/B in just 4 blocks (unlike 2-2-3 above,
  // which needs the full 14-day cycle spelled out to alternate which parent
  // gets the 3-day block) — each parent still ends up with 7 days per cycle.
  THREE_FOUR_FOUR_THREE: {
    label: "3-4-4-3",
    cycleLengthDays: 14,
    blockDayCounts: [3, 4, 4, 3],
  },
  // Not alternating — one parent always has the same 5 weekdays, the other
  // always has the same weekend. Simple fixed split rather than a rotation.
  FIVE_TWO: {
    label: "5-2 (fixed weekends)",
    cycleLengthDays: 7,
    blockDayCounts: [5, 2],
  },
} as const;

// Turns a pattern into a one-line human description for display (e.g. on the
// Calendar tab's "current schedule" summary). `parentNames` maps userId ->
// first name; a block for an unrecognized userId falls back to "a parent" so
// this never throws on stale/partial data.
export function describeCustodyPattern(
  pattern: CustodyPattern,
  parentNames: Record<string, string>
): string {
  const { cycleLengthDays, blocks } = pattern;
  if (!blocks || blocks.length === 0) return "No schedule set";

  const parts = blocks.map((b) => `${b.days} day${b.days === 1 ? "" : "s"} with ${parentNames[b.userId] ?? "a parent"}`);
  return `${parts.join(", ")} — repeating every ${cycleLengthDays} days`;
}
