import { Router, type Request } from "express";
import type { CreateListItemRequest, ListItemDto, UpdateListItemAssignmentRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/lists. Necessities + wishlist share one
// model (ListItem.type) — the frontend splits them into two tabs.
// Necessities use `assignedToId` (real delegation — any family member can
// assign/reassign to any other family member). Wishlist uses `claimedById`
// (self-claim/"Reserve" — whoever claims it is giving that gift).
export const listItemsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ItemParams = { childId: string; itemId: string };

function toDto(row: {
  id: string;
  childId: string;
  type: "NECESSITY" | "WISHLIST";
  title: string;
  description: string | null;
  sizeValue: string | null;
  assignedToId: string | null;
  assignedTo: { firstName: string; lastName: string } | null;
  claimedById: string | null;
  claimedBy: { firstName: string; lastName: string } | null;
  createdAt: Date;
}): ListItemDto {
  return {
    id: row.id,
    childId: row.childId,
    type: row.type,
    title: row.title,
    description: row.description,
    sizeValue: row.sizeValue,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`.trim() : null,
    claimedById: row.claimedById,
    claimedByName: row.claimedBy ? `${row.claimedBy.firstName} ${row.claimedBy.lastName}`.trim() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const INCLUDE = { assignedTo: true, claimedBy: true } as const;

// Any family member may be assigned a Necessity — validated against
// ChildAccess the same way family-member listing (/children/:childId/family)
// already scopes membership.
async function assertChildMember(childId: string, userId: string) {
  const access = await prisma.childAccess.findUnique({
    where: { childId_userId: { childId, userId } },
  });
  if (!access) throw new ApiError(404, "That person doesn't have access to this child");
}

listItemsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await prisma.listItem.findMany({
      where: { childId: req.params.childId },
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

listItemsRouter.post("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateListItemRequest>;
    if (!body.title?.trim()) {
      throw new ApiError(400, "title is required");
    }
    if (body.type !== "NECESSITY" && body.type !== "WISHLIST") {
      throw new ApiError(400, "type must be NECESSITY or WISHLIST");
    }
    if (body.assignedToId) {
      if (body.type !== "NECESSITY") {
        throw new ApiError(400, "assignedToId only applies to NECESSITY items");
      }
      await assertChildMember(req.params.childId, body.assignedToId);
    }
    const row = await prisma.listItem.create({
      data: {
        childId: req.params.childId,
        type: body.type,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        sizeValue: body.sizeValue?.trim() || null,
        assignedToId: body.assignedToId || null,
      },
      include: INCLUDE,
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

// Set/change/clear a Necessity's assignment. Unlike claim/reserve, this is
// real delegation — any family member may assign or reassign it to any
// other family member, not just claim it for themselves.
listItemsRouter.patch("/:itemId/assign", async (req: Request<ItemParams>, res, next) => {
  try {
    const existing = await prisma.listItem.findFirst({
      where: { id: req.params.itemId, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "List item not found");

    const body = req.body as Partial<UpdateListItemAssignmentRequest>;
    const assignedToId = body.assignedToId ?? null;
    if (assignedToId) {
      await assertChildMember(req.params.childId, assignedToId);
    }

    const row = await prisma.listItem.update({
      where: { id: existing.id },
      data: { assignedToId },
      include: INCLUDE,
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

// Toggle claim/"Reserve" (Wishlist): unclaimed -> claimed by caller; claimed
// by caller -> unclaimed; claimed by someone else -> 409 (someone else
// already stepped up).
listItemsRouter.patch("/:itemId/claim", async (req: Request<ItemParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const existing = await prisma.listItem.findFirst({
      where: { id: req.params.itemId, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "List item not found");

    if (existing.claimedById && existing.claimedById !== userId) {
      throw new ApiError(409, "This item is already claimed by someone else");
    }

    // Conditional update guarded on the claim state we just read, so two
    // concurrent claim/unclaim attempts can't both succeed silently — the
    // loser's updateMany matches zero rows and gets a 409 instead.
    const targetClaimedById = existing.claimedById === userId ? null : userId;
    const { count } = await prisma.listItem.updateMany({
      where: { id: existing.id, claimedById: existing.claimedById },
      data: { claimedById: targetClaimedById },
    });
    if (count === 0) {
      throw new ApiError(409, "Someone else already changed this item's claim — refresh and try again");
    }

    const row = await prisma.listItem.findUniqueOrThrow({
      where: { id: existing.id },
      include: INCLUDE,
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

listItemsRouter.delete("/:itemId", async (req: Request<ItemParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const existing = await prisma.listItem.findFirst({
      where: { id: req.params.itemId, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "List item not found");

    // ListItem has no creator/authorId field on the schema, so ownership is
    // approximated by "current claimer" — only whoever claimed the item (or
    // no one, for an unclaimed item) may delete it. Necessities' assignment
    // is collaborative (any member can reassign), so it isn't used to gate
    // deletion the way claim is.
    if (existing.claimedById && existing.claimedById !== userId) {
      throw new ApiError(403, "Only the person who claimed this item can delete it");
    }

    await prisma.listItem.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
