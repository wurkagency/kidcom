import { Router, type Request } from "express";
import type { CalendarEventRequestDto, CreateCalendarEventRequestRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { pushQueue } from "../../lib/pushQueue";
import { requireCapability } from "../../lib/permissions";

// Mounted at /children/:childId/calendar-event-requests. Post-launch backlog
// Phase C — close sibling of swapRequests.ts, for the FAMILY/Caregiver
// "request" half of calendar_event:manage's §1.4 matrix row that was never
// built (calendarEvents.ts's own comment used to point here as the future
// follow-up). Approving creates a real CalendarEvent row; this row is never
// itself the event, same as a SwapRequest never becomes the custody day.
export const calendarEventRequestsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildRequestParams = { childId: string; id: string };

// HOLIDAY is system-seeded only (see calendar.ts's ensureHolidaysSeeded) —
// same exclusion calendarEvents.ts's own writable-category list applies.
const REQUESTABLE_CATEGORIES: CreateCalendarEventRequestRequest["category"][] = [
  "CUSTODY",
  "APPOINTMENT",
  "MEDICAL",
  "SCHOOL",
  "ACTIVITY",
  "PLANNED_HOLIDAY",
];

function toDto(row: {
  id: string;
  category: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  notes: string | null;
  requestedById: string;
  status: string;
  message: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): CalendarEventRequestDto {
  return {
    id: row.id,
    category: row.category as CalendarEventRequestDto["category"],
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    notes: row.notes,
    requestedById: row.requestedById,
    status: row.status as CalendarEventRequestDto["status"],
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

calendarEventRequestsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await prisma.calendarEventRequest.findMany({
      where: { childId: req.params.childId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

calendarEventRequestsRouter.post(
  "/",
  requireCapability("calendar_event_request:create"),
  async (req: Request<ChildParams>, res, next) => {
    try {
      const body = req.body as Partial<CreateCalendarEventRequestRequest>;
      if (!body.category || !body.title || !body.startsAt) {
        throw new ApiError(400, "category, title, and startsAt are required");
      }
      if (!REQUESTABLE_CATEGORIES.includes(body.category)) {
        throw new ApiError(400, `category must be one of: ${REQUESTABLE_CATEGORIES.join(", ")}`);
      }

      const row = await prisma.calendarEventRequest.create({
        data: {
          childId: req.params.childId,
          category: body.category,
          title: body.title,
          startsAt: new Date(body.startsAt),
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          notes: body.notes,
          requestedById: req.session.userId!,
          message: body.message,
        },
      });

      // Push to every other PARENT/GUARDIAN member — best-effort, same
      // pattern as swapRequests.ts.
      const approvers = await prisma.childAccess.findMany({
        where: { childId: req.params.childId, role: { in: ["PARENT", "GUARDIAN"] }, userId: { not: req.session.userId! } },
        select: { userId: true },
      });
      await Promise.all(
        approvers.map((a) =>
          pushQueue.add("send-push", {
            userId: a.userId,
            title: "Calendar event requested",
            body: `A calendar event was requested: "${row.title}"`,
            url: "/calendar",
          })
        )
      );

      res.status(201).json(toDto(row));
    } catch (err) {
      next(err);
    }
  }
);

// Approve/decline. Not-self check on top of the role gate, same reasoning
// as swapRequests.ts: a PARENT/GUARDIAN could otherwise approve their own
// request just by passing the capability check.
calendarEventRequestsRouter.patch(
  "/:id",
  requireCapability("calendar_event_request:approve"),
  async (req: Request<ChildRequestParams>, res, next) => {
    try {
      const existing = await prisma.calendarEventRequest.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
      });
      if (!existing) throw new ApiError(404, "Calendar event request not found");
      if (existing.requestedById === req.session.userId) {
        throw new ApiError(400, "You can't approve or decline your own request");
      }

      const body = req.body as { status?: "APPROVED" | "DECLINED" };
      if (body.status !== "APPROVED" && body.status !== "DECLINED") {
        throw new ApiError(400, "status must be APPROVED or DECLINED");
      }

      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.calendarEventRequest.update({
          where: { id: req.params.id },
          data: { status: body.status, resolvedAt: new Date() },
        });
        if (body.status === "APPROVED") {
          await tx.calendarEvent.create({
            data: {
              childId: req.params.childId,
              category: existing.category,
              title: existing.title,
              startsAt: existing.startsAt,
              endsAt: existing.endsAt,
              notes: existing.notes,
            },
          });
        }
        return updated;
      });

      await pushQueue.add("send-push", {
        userId: existing.requestedById,
        title: "Calendar event request " + (body.status === "APPROVED" ? "approved" : "declined"),
        body: `Your request for "${existing.title}" was ${body.status.toLowerCase()}`,
        url: "/calendar",
      });

      res.json(toDto(row));
    } catch (err) {
      next(err);
    }
  }
);
