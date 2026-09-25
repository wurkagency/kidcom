import { Router, type Request } from "express";
import type { CreateCalendarEventRequest, ToggleChecklistItemRequest, ToggleConfirmationRequest, UpdateCalendarEventRequest } from "@kinnd/shared";

import { ApiError } from "../../middleware/errorHandler";
import { CALENDAR_EVENT_INCLUDE, toCalendarEventDto } from "../../lib/calendarEventDto";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { assertUsableCategory } from "../../lib/categories";
import { prisma } from "../../db";
import { notify } from "../../lib/notify";

// Mounted at /children/:childId/calendar-events. National holidays are
// system-seeded (the calendar route's ensureHolidaysSeeded) and read-only.
export const calendarEventsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEventParams = { childId: string; id: string };
type ChecklistItemParams = { childId: string; id: string; itemId: string };

/** "Handled by" must be someone who is a member of this child. */
async function assertMemberOrNull(childId: string, userId: string | null | undefined): Promise<string | null | undefined> {
  if (userId === undefined || userId === null) return userId;
  const member = await prisma.childAccess.findUnique({ where: { childId_userId: { childId, userId } } });
  if (!member) throw new ApiError(400, "The person handling this must be a member of the child's family");
  return userId;
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

// Replaces an event's checklist wholesale — simplest correct semantics for a
// short freeform list edited as a unit from EventFormPage. `tx` is a Prisma
// transaction client, typed loosely (`any`) to match this codebase's
// existing convention for transaction-callback params elsewhere.
async function replaceChecklist(tx: any, calendarEventId: string, items: { label: string; kind?: "TASK" | "PACKING" }[]) {
  await tx.calendarEventChecklistItem.deleteMany({ where: { calendarEventId } });
  if (items.length === 0) return;
  await tx.calendarEventChecklistItem.createMany({
    data: items.map((item, index) => ({
      calendarEventId,
      kind: item.kind === "PACKING" ? "PACKING" : "TASK",
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
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.calendarEvent.findMany({
        where: {
          childId: req.params.childId,
          ...(linkedToWishlist ? { listItems: { some: { type: "WISHLIST" } } } : {}),
        },
        include: CALENDAR_EVENT_INCLUDE,
        orderBy: { startsAt: "asc" },
      })
    );
    res.json({ items: rows.map(toCalendarEventDto) });
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.get("/:id", async (req: Request<ChildEventParams>, res, next) => {
  try {
    const row = await withRls(req.session.userId!, (tx) =>
      tx.calendarEvent.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
        include: CALENDAR_EVENT_INCLUDE,
      })
    );
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
    if (!body.title || !body.startsAt) {
      throw new ApiError(400, "title and startsAt are required");
    }
    validateRecurrence(body);
    const categoryId = await assertUsableCategory(req.session.userId!, body.categoryId);
    const assigneeId = await assertMemberOrNull(req.params.childId, body.assigneeUserId);
    const row = await withRls(req.session.userId!, async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          childId: req.params.childId,
          categoryId,
          title: body.title!,
          startsAt: new Date(body.startsAt!),
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          allDay: body.allDay ?? false,
          notes: body.notes,
          location: body.location,
          address: body.address,
          assigneeId: assigneeId ?? undefined,
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
    const [members, creator] = await Promise.all([
      prisma.childAccess.findMany({ where: { childId: req.params.childId }, select: { userId: true } }),
      prisma.user.findUnique({ where: { id: req.session.userId! }, select: { firstName: true } }),
    ]);
    await notify(
      members.map((m) => m.userId),
      {
        kind: "event.created",
        params: { actor: creator?.firstName ?? null, title: row.title, startsAt: row.startsAt.toISOString(), allDay: row.allDay ? 1 : 0 },
        url: `/children/${req.params.childId}/events/${row.id}`,
        childId: req.params.childId,
        actorId: req.session.userId!,
      }
    );
    res.status(201).json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});

calendarEventsRouter.patch("/:id", requireCapability("calendar_event:manage"), async (req: Request<ChildEventParams>, res, next) => {
  try {
    const body = req.body as UpdateCalendarEventRequest;
    validateRecurrence(body);
    const categoryId = body.categoryId === undefined ? undefined : await assertUsableCategory(req.session.userId!, body.categoryId);
    const assigneeId = await assertMemberOrNull(req.params.childId, body.assigneeUserId);
    const row = await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.calendarEvent.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
      });
      if (!existing) throw new ApiError(404, "Event not found");
      if (existing.kind === "NATIONAL_HOLIDAY") {
        throw new ApiError(400, "National holidays can't be edited");
      }

      await tx.calendarEvent.update({
        where: { id: req.params.id },
        data: {
          categoryId,
          title: body.title,
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          allDay: body.allDay,
          notes: body.notes,
          location: body.location,
          address: body.address,
          assigneeId,
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
    await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.calendarEvent.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
      });
      if (!existing) throw new ApiError(404, "Event not found");
      if (existing.kind === "NATIONAL_HOLIDAY") {
        throw new ApiError(400, "National holidays can't be deleted");
      }

      await tx.calendarEvent.delete({ where: { id: req.params.id } });
    });
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
    const body = req.body as Partial<ToggleChecklistItemRequest>;
    if (typeof body.isChecked !== "boolean") {
      throw new ApiError(400, "isChecked (boolean) is required");
    }

    const row = await withRls(req.session.userId!, async (tx) => {
      const event = await tx.calendarEvent.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
      });
      if (!event) throw new ApiError(404, "Event not found");

      const { count } = await tx.calendarEventChecklistItem.updateMany({
        where: { id: req.params.itemId, calendarEventId: req.params.id },
        data: { isChecked: body.isChecked },
      });
      if (count === 0) throw new ApiError(404, "Checklist item not found");

      return tx.calendarEvent.findUniqueOrThrow({
        where: { id: req.params.id },
        include: CALENDAR_EVENT_INCLUDE,
      });
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
    const body = req.body as Partial<ToggleConfirmationRequest>;
    if (typeof body.confirmed !== "boolean") {
      throw new ApiError(400, "confirmed (boolean) is required");
    }
    const userId = req.session.userId!;

    const row = await withRls(userId, async (tx) => {
      const event = await tx.calendarEvent.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
      });
      if (!event) throw new ApiError(404, "Event not found");
      if (!event.confirmable) {
        throw new ApiError(400, "This event isn't open for confirmation");
      }

      if (body.confirmed) {
        await tx.calendarEventConfirmation.upsert({
          where: { calendarEventId_userId: { calendarEventId: req.params.id, userId } },
          create: { calendarEventId: req.params.id, userId },
          update: {},
        });
      } else {
        await tx.calendarEventConfirmation.deleteMany({
          where: { calendarEventId: req.params.id, userId },
        });
      }

      return tx.calendarEvent.findUniqueOrThrow({
        where: { id: req.params.id },
        include: CALENDAR_EVENT_INCLUDE,
      });
    });
    res.json(toCalendarEventDto(row));
  } catch (err) {
    next(err);
  }
});
