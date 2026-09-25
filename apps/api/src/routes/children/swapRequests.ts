import { Router, type Request } from "express";
import type { CreateSwapRequestRequest, SwapRequestDto } from "@kinnd/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { notify } from "../../lib/notify";

// Mounted at /children/:childId/swap-requests. Requests target a computed
// custody date (see packages/shared/src/custody.ts), not a stored
// CalendarEvent — see the chunk 4 plan notes.
export const swapRequestsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildRequestParams = { childId: string; id: string };

export function toSwapRequestDto(row: {
  id: string;
  date: Date;
  requestedById: string;
  status: string;
  message: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): SwapRequestDto {
  return {
    id: row.id,
    date: row.date.toISOString(),
    requestedById: row.requestedById,
    status: row.status as SwapRequestDto["status"],
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

swapRequestsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.swapRequest.findMany({
        where: { childId: req.params.childId },
        orderBy: { createdAt: "desc" },
      })
    );
    res.json({ items: rows.map(toSwapRequestDto) });
  } catch (err) {
    next(err);
  }
});

swapRequestsRouter.post("/", requireCapability("swap_request:create"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateSwapRequestRequest>;
    if (!body.date) {
      throw new ApiError(400, "date is required");
    }
    const date = body.date;
    const row = await withRls(req.session.userId!, (tx) =>
      tx.swapRequest.create({
        data: {
          childId: req.params.childId,
          date: new Date(date),
          requestedById: req.session.userId!,
          message: body.message,
        },
      })
    );

    // Push to the child's other PARENT-role members (not the requester) —
    // best-effort, doesn't block the response (chunk 8).
    const [otherParents, requester] = await Promise.all([
      prisma.childAccess.findMany({
        where: { childId: req.params.childId, role: "PARENT", userId: { not: req.session.userId! } },
        select: { userId: true },
      }),
      prisma.user.findUnique({ where: { id: req.session.userId! }, select: { firstName: true } }),
    ]);
    await notify(
      otherParents.map((a) => a.userId),
      {
        kind: "swap.requested",
        params: { actor: requester?.firstName ?? null, date: row.date.toISOString().slice(0, 10) },
        url: "/calendar",
        childId: req.params.childId,
        actorId: req.session.userId!,
      }
    );

    res.status(201).json(toSwapRequestDto(row));
  } catch (err) {
    next(err);
  }
});

// Approve/decline — spec §1.4: PARENT only (FAMILY may request a swap but
// not approve one). The not-self check below still matters on top of that:
// a PARENT can't approve their own request just because they also pass the
// role gate.
swapRequestsRouter.patch("/:id", requireCapability("swap_request:approve"), async (req: Request<ChildRequestParams>, res, next) => {
  try {
    const body = req.body as { status?: "APPROVED" | "DECLINED" };

    const { existing, row, status } = await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.swapRequest.findFirst({
        where: { id: req.params.id, childId: req.params.childId },
      });
      if (!existing) throw new ApiError(404, "Swap request not found");
      if (existing.requestedById === req.session.userId) {
        throw new ApiError(400, "You can't approve or decline your own request");
      }
      if (body.status !== "APPROVED" && body.status !== "DECLINED") {
        throw new ApiError(400, "status must be APPROVED or DECLINED");
      }
      const status = body.status;

      const row = await tx.swapRequest.update({
        where: { id: req.params.id },
        data: { status, resolvedAt: new Date() },
      });
      return { existing, row, status };
    });

    const decider = await prisma.user.findUnique({ where: { id: req.session.userId! }, select: { firstName: true } });
    await notify([existing.requestedById], {
      kind: "swap.decided",
      params: { actor: decider?.firstName ?? null, date: row.date.toISOString().slice(0, 10), status },
      url: "/calendar",
      childId: row.childId,
      actorId: req.session.userId!,
    });

    res.json(toSwapRequestDto(row));
  } catch (err) {
    next(err);
  }
});
