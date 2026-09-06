import { Router, type Request } from "express";
import type { CreateListItemRequest, ListItemDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/lists. Necessities + wishlist share one
// model (ListItem.type) — the frontend splits them into two sections.
export const listItemsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ItemParams = { childId: string; itemId: string };

function toDto(row: {
  id: string;
  childId: string;
  type: "NECESSITY" | "WISHLIST";
  title: string;
  sizeValue: string | null;
  claimedById: string | null;
  claimedBy: { firstName: string; lastName: string } | null;
  createdAt: Date;
}): ListItemDto {
  return {
    id: row.id,
    childId: row.childId,
    type: row.type,
    title: row.title,
    sizeValue: row.sizeValue,
    claimedById: row.claimedById,
    claimedByName: row.claimedBy ? `${row.claimedBy.firstName} ${row.claimedBy.lastName}`.trim() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

listItemsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await prisma.listItem.findMany({
      where: { childId: req.params.childId },
      include: { claimedBy: true },
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
    const row = await prisma.listItem.create({
      data: {
        childId: req.params.childId,
        type: body.type,
        title: body.title.trim(),
        sizeValue: body.sizeValue?.trim() || null,
      },
      include: { claimedBy: true },
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

// Toggle claim: unclaimed -> claimed by caller; claimed by caller -> unclaimed;
// claimed by someone else -> 409 (someone else already stepped up).
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
      include: { claimedBy: true },
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
    // no one, for an unclaimed item) may delete it.
    if (existing.claimedById && existing.claimedById !== userId) {
      throw new ApiError(403, "Only the person who claimed this item can delete it");
    }

    await prisma.listItem.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
