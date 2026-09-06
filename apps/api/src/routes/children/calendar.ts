import { Router, type Request } from "express";
import { resolveCustodyForDate } from "@kidcom/shared";
import type { CalendarEventDto, CalendarRangeResponse, CustodyPattern } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { getDkHolidays } from "../../lib/dkHolidays";

// Mounted at /children/:childId/calendar?start=&end=. Combines the computed
// custody schedule (see packages/shared/src/custody.ts) with real
// CalendarEvent rows for the range, lazily seeding any un-seeded holiday
// year the range touches.
export const calendarRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function ensureHolidaysSeeded(childId: string, years: number[]) {
  for (const year of years) {
    const existing = await prisma.calendarEvent.findFirst({
      where: {
        childId,
        category: "HOLIDAY",
        startsAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
    });
    if (existing) continue;

    const holidays = getDkHolidays(year);
    await prisma.calendarEvent.createMany({
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
    await ensureHolidaysSeeded(req.params.childId, years);

    const [plan, events] = await Promise.all([
      prisma.custodyPlan.findFirst({
        where: { childId: req.params.childId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.calendarEvent.findMany({
        where: { childId: req.params.childId, startsAt: { gte: start, lt: endExclusive } },
        orderBy: { startsAt: "asc" },
      }),
    ]);

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

    const eventDtos: CalendarEventDto[] = events.map((e) => ({
      id: e.id,
      category: e.category as CalendarEventDto["category"],
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt?.toISOString() ?? null,
      allDay: e.allDay,
      notes: e.notes,
      editable: e.category !== "HOLIDAY",
      isMedical: e.isMedical,
    }));

    const response: CalendarRangeResponse = { custodyByDate, events: eventDtos };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
