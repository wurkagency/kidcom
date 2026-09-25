import { Router, type Request } from "express";
import type { CalendarEventRequestDto, CreateCalendarEventRequestRequest } from "@kinnd/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { assertUsableCategory } from "../../lib/categories";
import { notify } from "../../lib/notify";

// Mounted at /children/:childId/calendar-event-requests. Post-launch backlog
// Phase C — close sibling of swapRequests.ts, for the FAMILY/Caregiver
// "request" half of calendar_event:manage's §1.4 matrix row that was never
// built (calendarEvents.ts's own comment used to point here as the future
// follow-up). Approving creates a real CalendarEvent row; this row is never
// itself the event, same as a SwapRequest never becomes the custody day.
export const calendarEventRequestsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildRequestParams = { childId: string; id: string };

function toDto(row: {
  id: string;
  categoryId: string | null;
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
    categoryId: row.categoryId,
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
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.calendarEventRequest.findMany({
        where: { childId: req.params.childId },
        orderBy: { createdAt: "desc" },
      })
    );
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
      if (!body.title || !body.startsAt) {
        throw new ApiError(400, "title and startsAt are required");
      }
      const categoryId = await assertUsableCategory(req.session.userId!, body.categoryId);
      const title = body.title;
      const startsAt = body.startsAt;

      const row = await withRls(req.session.userId!, (tx) =>
        tx.calendarEventRequest.create({
          data: {
            childId: req.params.childId,
            categoryId,
            title,
            startsAt: new Date(startsAt),
            endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
            notes: body.notes,
            requestedById: req.session.userId!,
            message: body.message,
          },
        })
      );

      // Push to every other PARENT/GUARDIAN member — best-effort, same
      // pattern as swapRequests.ts.
      const approvers = await prisma.childAccess.findMany({
        where: { childId: req.params.childId, role: { in: ["PARENT", "GUARDIAN"] }, userId: { not: req.session.userId! } },
        select: { userId: true },
      });
      const requester = await prisma.user.findUnique({ where: { id: req.session.userId! }, select: { firstName: true } });
      await notify(
        approvers.map((a) => a.userId),
        {
          kind: "event.requested",
          params: { actor: requester?.firstName ?? null, title: row.title },
          url: "/calendar",
          childId: req.params.childId,
          actorId: req.session.userId!,
        }
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
      const body = req.body as { status?: "APPROVED" | "DECLINED" };

      const { existing, row, status } = await withRls(req.session.userId!, async (tx) => {
        const existing = await tx.calendarEventRequest.findFirst({
          where: { id: req.params.id, childId: req.params.childId },
        });
        if (!existing) throw new ApiError(404, "Calendar event request not found");
        if (existing.requestedById === req.session.userId) {
          throw new ApiError(400, "You can't approve or decline your own request");
        }
        if (body.status !== "APPROVED" && body.status !== "DECLINED") {
          throw new ApiError(400, "status must be APPROVED or DECLINED");
        }
        const status = body.status;

        const updated = await tx.calendarEventRequest.update({
          where: { id: req.params.id },
          data: { status, resolvedAt: new Date() },
        });
        if (status === "APPROVED") {
          await tx.calendarEvent.create({
            data: {
              childId: req.params.childId,
              categoryId: existing.categoryId,
              title: existing.title,
              startsAt: existing.startsAt,
              endsAt: existing.endsAt,
              notes: existing.notes,
            },
          });
        }
        return { existing, row: updated, status };
      });

      const decider = await prisma.user.findUnique({ where: { id: req.session.userId! }, select: { firstName: true } });
      await notify([existing.requestedById], {
        kind: "event.decided",
        params: { actor: decider?.firstName ?? null, title: existing.title, status },
        url: "/calendar",
        childId: req.params.childId,
        actorId: req.session.userId!,
      });

      res.json(toDto(row));
    } catch (err) {
      next(err);
    }
  }
);
