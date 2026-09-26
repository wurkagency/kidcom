import { Router, type Request } from "express";
import { resolveCustodyForDate, systemCategoryId } from "@kinnd/shared";
import type { CalendarRangeResponse, CustodyPattern } from "@kinnd/shared";

import type { Prisma } from "@kinnd/db";

import { ApiError } from "../../middleware/errorHandler";
import { getDkHolidays } from "../../lib/dkHolidays";
import { CALENDAR_EVENT_INCLUDE, toCalendarEventDto } from "../../lib/calendarEventDto";
import { withRls } from "../../lib/rls";
import { copenhagenMidnight } from "../../lib/validation";

// Mounted at /children/:childId/calendar?start=&end=. Combines the computed
// custody schedule (see packages/shared/src/custody.ts) with real
// CalendarEvent rows for the range, lazily seeding any un-seeded holiday
// year the range touches.
export const calendarRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function ensureHolidaysSeeded(tx: Prisma.TransactionClient, childId: string, years: number[]) {
  // Two requests for the same child (e.g. Today and Calendar loading at
  // once) must not both seed a year: serialise per child for the rest of
  // this transaction.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`holidays:${childId}`}))`;
  for (const year of years) {
    const existing = await tx.calendarEvent.findFirst({
      where: {
        childId,
        kind: "NATIONAL_HOLIDAY",
        startsAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
    });
    if (existing) continue;

    const holidays = getDkHolidays(year);
    await tx.calendarEvent.createMany({
      data: holidays.map((h) => ({
        childId,
        kind: "NATIONAL_HOLIDAY" as const,
        categoryIds: [systemCategoryId("holiday")],
        title: h.title,
        startsAt: h.date,
        allDay: true,
      })),
    });
  }
}

// Weekly-recurring CalendarEvent rows store only their series anchor
// (`startsAt`/`endsAt` of the *first* occurrence, plus
// `recurrenceIntervalWeeks`/`recurrenceEndsAt`) — occurrences are never
// materialized as their own rows. This synthesizes the occurrences that
// land inside [start, endExclusive) for one query's response, each copying
// the template's real `id` (so editing/deleting an occurrence acts on the
// whole series — there's no per-occurrence override support) with
// `startsAt`/`endsAt` shifted to that occurrence's date.
function expandRecurringEvents<T extends { startsAt: Date; endsAt: Date | null; recurrenceIntervalWeeks: number | null; recurrenceEndsAt: Date | null }>(
  templates: T[],
  start: Date,
  endExclusive: Date
): T[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const occurrences: T[] = [];

  for (const template of templates) {
    const intervalWeeks = template.recurrenceIntervalWeeks;
    if (!intervalWeeks) continue;
    const intervalMs = intervalWeeks * 7 * DAY_MS;
    const durationMs = template.endsAt ? template.endsAt.getTime() - template.startsAt.getTime() : null;

    // Jump straight to the first occurrence on/after `start` instead of
    // walking one interval at a time from the anchor (which could be years
    // in the past) — then step forward one interval per loop until past
    // the range or the series' own end date.
    let occurrenceStart = template.startsAt.getTime();
    if (occurrenceStart < start.getTime()) {
      const stepsToSkip = Math.floor((start.getTime() - occurrenceStart) / intervalMs);
      occurrenceStart += stepsToSkip * intervalMs;
      while (occurrenceStart < start.getTime()) occurrenceStart += intervalMs;
    }

    const seriesEndMs = template.recurrenceEndsAt?.getTime() ?? null;
    while (occurrenceStart < endExclusive.getTime() && (seriesEndMs === null || occurrenceStart <= seriesEndMs)) {
      occurrences.push({
        ...template,
        startsAt: new Date(occurrenceStart),
        endsAt: durationMs !== null ? new Date(occurrenceStart + durationMs) : null,
      });
      occurrenceStart += intervalMs;
    }
  }

  return occurrences;
}

/**
 * The custody plan and every event (one-off, expanded recurring, national
 * holidays) touching [start, end] for one child. `end` is inclusive.
 * Run inside withRls; also used by the overview endpoint.
 */
export async function loadChildRange(tx: Prisma.TransactionClient, childId: string, start: Date, end: Date) {
  // `start` / `end` name calendar days (UTC-midnight Dates of "YYYY-MM-DD").
  // Query by Copenhagen days: from the first day's local midnight up to the
  // local midnight after the last day (exclusive) — so a 00:30 appointment
  // shows on its own day, and DST days are 23/25 hours long.
  const endExclusive = copenhagenMidnight(dateOnly(new Date(end.getTime() + 24 * 60 * 60 * 1000)));
  const from = copenhagenMidnight(dateOnly(start));
  const years = Array.from(new Set([start.getUTCFullYear(), end.getUTCFullYear()]));
  await ensureHolidaysSeeded(tx, childId, years);

  const [plan, oneOffEvents, recurringTemplates] = await Promise.all([
    tx.custodyPlan.findFirst({ where: { childId }, orderBy: { createdAt: "desc" } }),
    // One-off events overlapping the range (a multi-day event that started
    // before `from` but ends inside it must still appear).
    tx.calendarEvent.findMany({
      where: {
        childId,
        recurrenceIntervalWeeks: null,
        startsAt: { lt: endExclusive },
        OR: [{ endsAt: null, startsAt: { gte: from } }, { endsAt: { gte: from } }],
      },
      include: CALENDAR_EVENT_INCLUDE,
      orderBy: { startsAt: "asc" },
    }),
    // Recurring series that could have an occurrence in the range.
    tx.calendarEvent.findMany({
      where: {
        childId,
        recurrenceIntervalWeeks: { not: null },
        startsAt: { lt: endExclusive },
        OR: [{ recurrenceEndsAt: null }, { recurrenceEndsAt: { gte: from } }],
      },
      include: CALENDAR_EVENT_INCLUDE,
    }),
  ]);

  const events = [...oneOffEvents, ...expandRecurringEvents(recurringTemplates, from, endExclusive)];
  events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { plan, events };
}

calendarRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const startParam = req.query.start as string | undefined;
    const endParam = req.query.end as string | undefined;
    if (!startParam || !endParam) {
      throw new ApiError(400, "start and end query params (YYYY-MM-DD) are required");
    }
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiError(400, "start and end must be valid dates");
    }
    const { plan, events } = await withRls(req.session.userId!, (tx) => loadChildRange(tx, req.params.childId, start, end));

    const custodyByDate: Record<string, string | null> = {};
    if (plan) {
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
        custodyByDate[dateOnly(d)] = resolveCustodyForDate(
          { startDate: plan.startDate, patternDays: plan.patternDays as CustodyPattern },
          d
        );
      }
    }

    const eventDtos = events.map(toCalendarEventDto);

    const response: CalendarRangeResponse = { custodyByDate, events: eventDtos };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
