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
  isMedical: boolean;
}): CalendarEventDto {
  return {
    id: row.id,
    category: row.category as CalendarEventDto["category"],
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    allDay: row.allDay,
    notes: row.notes,
    editable: row.category !== "HOLIDAY",
    isMedical: row.isMedical,
  };
}

calendarEventsRouter.post("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateCalendarEventRequest>;
    if (!body.category || !body.title || !body.startsAt) {
      throw new ApiError(400, "category, title, and startsAt are required");
    }
    if (body.category !== "APPOINTMENT" && body.category !== "PLANNED_HOLIDAY") {
      throw new ApiError(400, "category must be APPOINTMENT or PLANNED_HOLIDAY");
    }
    const row = await prisma.calendarEvent.create({
      data: {
        childId: req.params.childId,
        category: body.category,
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        allDay: body.allDay ?? false,
        notes: body.notes,
        isMedical: body.isMedical ?? false,
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
    const row = await prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        category: body.category,
        title: body.title,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        allDay: body.allDay,
        notes: body.notes,
        isMedical: body.isMedical,
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
