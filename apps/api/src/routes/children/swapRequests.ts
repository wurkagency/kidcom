import { Router, type Request } from "express";
import type { CreateSwapRequestRequest, SwapRequestDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { pushQueue } from "../../lib/pushQueue";
import { requireCapability } from "../../lib/permissions";

// Mounted at /children/:childId/swap-requests. Requests target a computed
// custody date (see packages/shared/src/custody.ts), not a stored
// CalendarEvent — see the chunk 4 plan notes.
export const swapRequestsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildRequestParams = { childId: string; id: string };

function toDto(row: {
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
    const rows = await prisma.swapRequest.findMany({
      where: { childId: req.params.childId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items: rows.map(toDto) });
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
    const row = await prisma.swapRequest.create({
      data: {
        childId: req.params.childId,
        date: new Date(body.date),
        requestedById: req.session.userId!,
        message: body.message,
      },
    });

    // Push to the child's other PARENT-role members (not the requester) —
    // best-effort, doesn't block the response (chunk 8).
    const otherParents = await prisma.childAccess.findMany({
      where: { childId: req.params.childId, role: "PARENT", userId: { not: req.session.userId! } },
      select: { userId: true },
    });
    await Promise.all(
      otherParents.map((a) =>
        pushQueue.add("send-push", {
          userId: a.userId,
          title: "Swap request",
          body: `A swap was requested for ${row.date.toLocaleDateString()}`,
          url: `/calendar`,
        })
      )
    );

    res.status(201).json(toDto(row));
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
    const existing = await prisma.swapRequest.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Swap request not found");
    if (existing.requestedById === req.session.userId) {
      throw new ApiError(400, "You can't approve or decline your own request");
    }

    const body = req.body as { status?: "APPROVED" | "DECLINED" };
    if (body.status !== "APPROVED" && body.status !== "DECLINED") {
      throw new ApiError(400, "status must be APPROVED or DECLINED");
    }

    const row = await prisma.swapRequest.update({
      where: { id: req.params.id },
      data: { status: body.status, resolvedAt: new Date() },
    });

    await pushQueue.add("send-push", {
      userId: existing.requestedById,
      title: "Swap request " + (body.status === "APPROVED" ? "approved" : "declined"),
      body: `Your swap request for ${row.date.toLocaleDateString()} was ${body.status.toLowerCase()}`,
      url: `/calendar`,
    });

    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});
