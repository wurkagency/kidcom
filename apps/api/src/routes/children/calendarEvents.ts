import { Router, type Request } from "express";
import type { CalendarEventDto, CreateCalendarEventRequest, UpdateCalendarEventRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/calendar-events. Only APPOINTMENT and
// PLANNED_HOLIDAY are writable here — HOLIDAY rows are system-seeded (see
// the calendar route's ensureHolidaysSeeded) and rejected below.
export const calendarEventsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEventParams = { childId: string; id: string };

function toDto(row: {
  id: string;
  category: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  notes: string | null;
  location: string | null;
  isMedical: boolean;
  isSport: boolean;
  recurrenceIntervalWeeks: number | null;
  recurrenceEndsAt: Date | null;
}): CalendarEventDto {
  return {
    id: row.id,
    category: row.category as CalendarEventDto["category"],
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    allDay: row.allDay,
    notes: row.notes,
    location: row.location,
    editable: row.category !== "HOLIDAY",
    isMedical: row.isMedical,
    isSport: row.isSport,
    recurrenceIntervalWeeks: row.recurrenceIntervalWeeks,
    recurrenceEndsAt: row.recurrenceEndsAt?.toISOString() ?? null,
  };
}

function validateRecurrence(body: Partial<CreateCalendarEventRequest>) {
  if (body.recurrenceIntervalWeeks === undefined || body.recurrenceIntervalWeeks === null) return;
  if (!Number.isInteger(body.recurrenceIntervalWeeks) || body.recurrenceIntervalWeeks < 1) {
    throw new ApiError(400, "recurrenceIntervalWeeks must be a positive integer");
  }
}

// `undefined` means "field omitted, leave unchanged on update"; `null`
// means "explicitly clear" — both are meaningful and must pass through
// distinctly rather than collapsing to one or the other.
function toRecurrenceEndsAtInput(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

// List events for this child — currently only used to power the "attach to
// an existing event" picker on Wishlist items (?linkedToWishlist=1), which
// needs a lightweight lookup of this child's wishlist-originated events. Not
// used for the main calendar grid, which goes through the combined
// custody+events endpoint in calendar.ts instead.
calendarEventsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const linkedToWishlist = req.query.linkedToWishlist === "1" || req.query.linkedToWishlist === "true";
    const rows = await prisma.calendarEvent.findMany({
      where: {
        childId: req.params.childId,
        ...(linkedToWishlist ? { listItems: { some: { type: "WISHLIST" } } } : {}),
      },
      orderBy: { startsAt: "asc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.get("/:id", async (req: Request<ChildEventParams>, res, next) => {
  try {
    const row = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!row) throw new ApiError(404, "Event not found");
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.post("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateCalendarEventRequest>;
    if (!body.category || !body.title || !body.startsAt) {
      throw new ApiError(400, "category, title, and startsAt are required");
    }
    if (body.category !== "APPOINTMENT" && body.category !== "PLANNED_HOLIDAY") {
      throw new ApiError(400, "category must be APPOINTMENT or PLANNED_HOLIDAY");
    }
    validateRecurrence(body);
    const row = await prisma.calendarEvent.create({
      data: {
        childId: req.params.childId,
        category: body.category,
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        allDay: body.allDay ?? false,
        notes: body.notes,
        location: body.location,
        isMedical: body.isMedical ?? false,
        isSport: body.isSport ?? false,
        recurrenceIntervalWeeks: body.recurrenceIntervalWeeks ?? undefined,
        recurrenceEndsAt: toRecurrenceEndsAtInput(body.recurrenceEndsAt) ?? undefined,
      },
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.patch("/:id", async (req: Request<ChildEventParams>, res, next) => {
  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Event not found");
    if (existing.category === "HOLIDAY") {
      throw new ApiError(400, "System holidays can't be edited");
    }

    const body = req.body as UpdateCalendarEventRequest;
    validateRecurrence(body);
    const row = await prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        category: body.category,
        title: body.title,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        allDay: body.allDay,
        notes: body.notes,
        location: body.location,
        isMedical: body.isMedical,
        isSport: body.isSport,
        recurrenceIntervalWeeks: body.recurrenceIntervalWeeks,
        recurrenceEndsAt: toRecurrenceEndsAtInput(body.recurrenceEndsAt),
      },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.delete("/:id", async (req: Request<ChildEventParams>, res, next) => {
  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Event not found");
    if (existing.category === "HOLIDAY") {
      throw new ApiError(400, "System holidays can't be deleted");
    }

    await prisma.calendarEvent.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
