import { Router, type Request } from "express";
import type { CreateCalendarEventRequest, ToggleChecklistItemRequest, ToggleConfirmationRequest, UpdateCalendarEventRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { CALENDAR_EVENT_INCLUDE, toCalendarEventDto } from "../../lib/calendarEventDto";
import { requireCapability } from "../../lib/permissions";

// Mounted at /children/:childId/calendar-events. Every category except
// HOLIDAY is writable here — HOLIDAY rows are system-seeded (see the
// calendar route's ensureHolidaysSeeded) and rejected below.
export const calendarEventsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEventParams = { childId: string; id: string };
type ChecklistItemParams = { childId: string; id: string; itemId: string };

const WRITABLE_CATEGORIES: CreateCalendarEventRequest["category"][] = [
  "CUSTODY",
  "APPOINTMENT",
  "MEDICAL",
  "SCHOOL",
  "ACTIVITY",
  "PLANNED_HOLIDAY",
];

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

// Replaces an event's checklist wholesale — simplest correct semantics for a
// short freeform list edited as a unit from EventFormPage. `tx` is a Prisma
// transaction client, typed loosely (`any`) to match this codebase's
// existing convention for transaction-callback params elsewhere.
async function replaceChecklist(tx: any, calendarEventId: string, items: { label: string }[]) {
  await tx.calendarEventChecklistItem.deleteMany({ where: { calendarEventId } });
  if (items.length === 0) return;
  await tx.calendarEventChecklistItem.createMany({
    data: items.map((item, index) => ({
      calendarEventId,
      label: item.label,
      sortOrder: index,
    })),
  });
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
      include: CALENDAR_EVENT_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    res.json({ items: rows.map(toCalendarEventDto) });
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.get("/:id", async (req: Request<ChildEventParams>, res, next) => {
  try {
    const row = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
      include: CALENDAR_EVENT_INCLUDE,
    });
    if (!row) throw new ApiError(404, "Event not found");
    res.json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});

// spec §1.4: FAMILY/Caregiver get "request" here (a distinct request/
// approve workflow), not full create/edit — that workflow doesn't exist yet
// (see lib/permissions.ts's comment on "calendar_event:manage"), so denied
// outright rather than granted in full.
calendarEventsRouter.post("/", requireCapability("calendar_event:manage"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateCalendarEventRequest>;
    if (!body.category || !body.title || !body.startsAt) {
      throw new ApiError(400, "category, title, and startsAt are required");
    }
    if (!WRITABLE_CATEGORIES.includes(body.category)) {
      throw new ApiError(400, `category must be one of: ${WRITABLE_CATEGORIES.join(", ")}`);
    }
    validateRecurrence(body);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          childId: req.params.childId,
          category: body.category!,
          title: body.title!,
          startsAt: new Date(body.startsAt!),
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          allDay: body.allDay ?? false,
          notes: body.notes,
          location: body.location,
          assignedNote: body.assignedNote,
          contactName: body.contactName,
          contactDetail: body.contactDetail,
          confirmable: body.confirmable ?? false,
          recurrenceIntervalWeeks: body.recurrenceIntervalWeeks ?? undefined,
          recurrenceEndsAt: toRecurrenceEndsAtInput(body.recurrenceEndsAt) ?? undefined,
        },
      });
      if (body.checklist?.length) {
        await replaceChecklist(tx, created.id, body.checklist);
      }
      return tx.calendarEvent.findUniqueOrThrow({ where: { id: created.id }, include: CALENDAR_EVENT_INCLUDE });
    });
    res.status(201).json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.patch("/:id", requireCapability("calendar_event:manage"), async (req: Request<ChildEventParams>, res, next) => {
  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Event not found");
    if (existing.category === "HOLIDAY") {
      throw new ApiError(400, "System holidays can't be edited");
    }

    const body = req.body as UpdateCalendarEventRequest;
    if (body.category && !WRITABLE_CATEGORIES.includes(body.category)) {
      throw new ApiError(400, `category must be one of: ${WRITABLE_CATEGORIES.join(", ")}`);
    }
    validateRecurrence(body);
    const row = await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id: req.params.id },
        data: {
          category: body.category,
          title: body.title,
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          allDay: body.allDay,
          notes: body.notes,
          location: body.location,
          assignedNote: body.assignedNote,
          contactName: body.contactName,
          contactDetail: body.contactDetail,
          confirmable: body.confirmable,
          recurrenceIntervalWeeks: body.recurrenceIntervalWeeks,
          recurrenceEndsAt: toRecurrenceEndsAtInput(body.recurrenceEndsAt),
        },
      });
      if (body.checklist !== undefined) {
        await replaceChecklist(tx, req.params.id, body.checklist);
      }
      return tx.calendarEvent.findUniqueOrThrow({ where: { id: req.params.id }, include: CALENDAR_EVENT_INCLUDE });
    });
    res.json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.delete("/:id", requireCapability("calendar_event:manage"), async (req: Request<ChildEventParams>, res, next) => {
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

// Toggle a single checklist item without resending the whole list —
// EventFormPage's editor still uses the full-replace PATCH above, but the
// calendar views' inline checklist ("Packed" badge tap) uses this instead.
calendarEventsRouter.patch("/:id/checklist/:itemId", async (req: Request<ChecklistItemParams>, res, next) => {
  try {
    const event = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!event) throw new ApiError(404, "Event not found");

    const body = req.body as Partial<ToggleChecklistItemRequest>;
    if (typeof body.isChecked !== "boolean") {
      throw new ApiError(400, "isChecked (boolean) is required");
    }

    const { count } = await prisma.calendarEventChecklistItem.updateMany({
      where: { id: req.params.itemId, calendarEventId: req.params.id },
      data: { isChecked: body.isChecked },
    });
    if (count === 0) throw new ApiError(404, "Checklist item not found");

    const row = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: req.params.id },
      include: CALENDAR_EVENT_INCLUDE,
    });
    res.json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});

// Self-service confirm/unconfirm — always acts on the caller's own userId
// from the session, never a body-supplied one, so no one can confirm on
// someone else's behalf.
calendarEventsRouter.patch("/:id/confirm", async (req: Request<ChildEventParams>, res, next) => {
  try {
    const event = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!event) throw new ApiError(404, "Event not found");
    if (!event.confirmable) {
      throw new ApiError(400, "This event isn't open for confirmation");
    }

    const body = req.body as Partial<ToggleConfirmationRequest>;
    if (typeof body.confirmed !== "boolean") {
      throw new ApiError(400, "confirmed (boolean) is required");
    }
    const userId = req.session.userId!;

    if (body.confirmed) {
      await prisma.calendarEventConfirmation.upsert({
        where: { calendarEventId_userId: { calendarEventId: req.params.id, userId } },
        create: { calendarEventId: req.params.id, userId },
        update: {},
      });
    } else {
      await prisma.calendarEventConfirmation.deleteMany({
        where: { calendarEventId: req.params.id, userId },
      });
    }

    const row = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: req.params.id },
      include: CALENDAR_EVENT_INCLUDE,
    });
    res.json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});
