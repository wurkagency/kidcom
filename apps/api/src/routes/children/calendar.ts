import { Router, type Request } from "express";
import { resolveCustodyForDate } from "@kidcom/shared";
import type { CalendarRangeResponse, CustodyPattern } from "@kidcom/shared";

import type { Prisma } from "@kidcom/db";

import { ApiError } from "../../middleware/errorHandler";
import { getDkHolidays } from "../../lib/dkHolidays";
import { CALENDAR_EVENT_INCLUDE, toCalendarEventDto } from "../../lib/calendarEventDto";
import { withRls } from "../../lib/rls";

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
  for (const year of years) {
    const existing = await tx.calendarEvent.findFirst({
      where: {
        childId,
        category: "HOLIDAY",
        startsAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
    });
    if (existing) continue;

    const holidays = getDkHolidays(year);
    await tx.calendarEvent.createMany({
      data: holidays.map((h) => ({
        childId,
        category: "HOLIDAY" as const,
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
    // Exclusive upper bound one day past `end` — `end` is parsed as
    // midnight UTC, so an inclusive `lte: end` would exclude almost every
    // event actually occurring on that calendar day.
    const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);

    const years = Array.from(
      new Set([start.getUTCFullYear(), end.getUTCFullYear()])
    );

    const [plan, oneOffEvents, recurringTemplates] = await withRls(req.session.userId!, async (tx) => {
      await ensureHolidaysSeeded(tx, req.params.childId, years);

      return Promise.all([
        tx.custodyPlan.findFirst({
          where: { childId: req.params.childId },
          orderBy: { createdAt: "desc" },
        }),
        // One-off events: excluding recurring templates (those are expanded
        // separately below, since their own startsAt is just the series
        // anchor and may sit long before this range). Range-overlap, not
        // range-containment: a multi-day event that started before `start`
        // but whose endsAt still falls on/after `start` must still be
        // fetched, or it silently disappears from every day but its first —
        // mirrors the same OR-on-end-field shape the recurring-template
        // query below already uses for recurrenceEndsAt.
        tx.calendarEvent.findMany({
          where: {
            childId: req.params.childId,
            recurrenceIntervalWeeks: null,
            startsAt: { lt: endExclusive },
            OR: [
              { endsAt: null, startsAt: { gte: start } },
              { endsAt: { gte: start } },
            ],
          },
          include: CALENDAR_EVENT_INCLUDE,
          orderBy: { startsAt: "asc" },
        }),
        // Recurring templates that could still have an occurrence landing in
        // this range: anchored on/before the range's end, and not already
        // ended (recurrenceEndsAt) before the range starts.
        tx.calendarEvent.findMany({
          where: {
            childId: req.params.childId,
            recurrenceIntervalWeeks: { not: null },
            startsAt: { lt: endExclusive },
            OR: [{ recurrenceEndsAt: null }, { recurrenceEndsAt: { gte: start } }],
          },
          include: CALENDAR_EVENT_INCLUDE,
        }),
      ]);
    });

    const events = [...oneOffEvents, ...expandRecurringEvents(recurringTemplates, start, endExclusive)];
    events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    const custodyByDate: Record<string, string | null> = {};
    if (plan) {
      for (
        let d = new Date(start);
        d <= end;
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
      ) {
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
