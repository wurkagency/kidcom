import { Router, type Request } from "express";
import type {
  ClaimListItemRequest,
  CreateListItemRequest,
  ListItemDto,
  UpdateListItemAssignmentRequest,
  UpdateListItemRequest,
} from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { can, requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { optionalDateOnly, optionalText } from "../../lib/validation";

// Mounted at /children/:childId/lists. Necessities + wishlist share one
// model (ListItem.type) — the frontend splits them into two tabs.
// Necessities use `assignedToId` (real delegation — any family member can
// assign/reassign to any other family member). Wishlist uses `claimedById`
// (self-claim/"Reserve" — whoever claims it is giving that gift).
export const listItemsRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ItemParams = { childId: string; itemId: string };

export function toListItemDto(row: {
  id: string;
  childId: string;
  type: "NECESSITY" | "WISHLIST";
  title: string;
  description: string | null;
  sizeValue: string | null;
  assignedToId: string | null;
  assignedTo: { firstName: string; lastName: string } | null;
  claimedById: string | null;
  claimedBy: { firstName: string; lastName: string; avatarUrl: string | null } | null;
  calendarEventId: string | null;
  image: { id: string } | null;
  dueOn: Date | null;
  claimedAt: Date | null;
  claimNote: string | null;
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
    calendarEventId: row.calendarEventId,
    imageAssetId: row.image?.id ?? null,
    dueOn: row.dueOn ? row.dueOn.toISOString().slice(0, 10) : null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    claimNote: row.claimNote,
    claimedByAvatarUrl: row.claimedBy?.avatarUrl ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const LIST_ITEM_INCLUDE = { assignedTo: true, claimedBy: true, image: { select: { id: true } } } as const;
const INCLUDE = LIST_ITEM_INCLUDE;
const toDto = toListItemDto;

// Any family member may be assigned a Necessity — validated against
// ChildAccess the same way family-member listing (/children/:childId/family)
// already scopes membership.
async function assertChildMember(childId: string, userId: string) {
  const access = await prisma.childAccess.findUnique({
    where: { childId_userId: { childId, userId } },
  });
  if (!access) throw new ApiError(404, "That person doesn't have access to this child");
}

// Attaches/replaces/clears a list item's single photo. Mirrors the
// clear-old-then-set-new pattern used for Child/User avatars (see PATCH
// /children/:childId) — the owning FK lives on MediaAsset
// (listItemImageForId), not on ListItem itself.
// `tx` is a Prisma transaction client — typed loosely (`any`) rather than
// `typeof prisma`, since a `$transaction` callback's client is a distinct
// (structurally identical but nominally different) type; matches this
// codebase's existing convention for `tx` params elsewhere.
async function setListItemImage(
  tx: any,
  itemId: string,
  currentImageAssetId: string | null,
  imageAssetId: string | null | undefined,
  userId: string
) {
  if (imageAssetId === undefined || imageAssetId === currentImageAssetId) return;
  if (currentImageAssetId) {
    await tx.mediaAsset.updateMany({
      where: { id: currentImageAssetId, listItemImageForId: itemId },
      data: { listItemImageForId: null },
    });
  }
  if (imageAssetId) {
    const asset = await tx.mediaAsset.findFirst({ where: { id: imageAssetId, ownerId: userId } });
    if (!asset) throw new ApiError(400, "Image not found");
    if (asset.listItemImageForId && asset.listItemImageForId !== itemId) {
      throw new ApiError(400, "That image is already attached to another item");
    }
    await tx.mediaAsset.update({ where: { id: imageAssetId }, data: { listItemImageForId: itemId } });
  }
}

listItemsRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await withRls(req.session.userId!, (tx) =>
      tx.listItem.findMany({
        where: { childId: req.params.childId },
        include: INCLUDE,
        orderBy: { createdAt: "asc" },
      })
    );
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

// spec 9.5: a Caregiver may claim a Wishlist item (PATCH .../claim, ungated
// below) but not add/manage list items — everyone else with FAMILY/PARENT
// access may.
listItemsRouter.post("/", requireCapability("list_item:manage"), async (req: Request<ChildParams>, res, next) => {
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
    const userId = req.session.userId!;
    const row = await withRls(userId, async (tx) => {
      if (body.calendarEventId) {
        if (body.type !== "WISHLIST") {
          throw new ApiError(400, "calendarEventId only applies to WISHLIST items");
        }
        // Verify the linked event actually belongs to this child before
        // wiring it up — prevents linking to another child's (or a
        // nonexistent) event by guessing/forging an id.
        const event = await tx.calendarEvent.findFirst({
          where: { id: body.calendarEventId, childId: req.params.childId },
        });
        if (!event) throw new ApiError(404, "Linked calendar event not found");
      }

      const created = await tx.listItem.create({
        data: {
          childId: req.params.childId,
          type: body.type!,
          title: body.title!.trim(),
          description: body.description?.trim() || null,
          sizeValue: body.sizeValue?.trim() || null,
          assignedToId: body.assignedToId || null,
          calendarEventId: body.calendarEventId || null,
          dueOn: optionalDateOnly(body.dueOn, "dueOn") ?? null,
        },
      });
      await setListItemImage(tx, created.id, null, body.imageAssetId || null, userId);
      return tx.listItem.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE });
    });
    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

listItemsRouter.get("/:itemId", async (req: Request<ItemParams>, res, next) => {
  try {
    const row = await withRls(req.session.userId!, (tx) =>
      tx.listItem.findFirst({
        where: { id: req.params.itemId, childId: req.params.childId },
        include: INCLUDE,
      })
    );
    if (!row) throw new ApiError(404, "List item not found");
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

// General edit — title/description/sizeValue/assignedToId/calendarEventId/
// imageAssetId, all independently optional (omitted = unchanged). Separate
// from PATCH /:itemId/assign (narrow reassignment-only) and
// PATCH /:itemId/claim (reserve toggle), which both stay as-is.
listItemsRouter.patch("/:itemId", requireCapability("list_item:manage"), async (req: Request<ItemParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as UpdateListItemRequest;

    const row = await withRls(userId, async (tx) => {
      const existing = await tx.listItem.findFirst({
        where: { id: req.params.itemId, childId: req.params.childId },
        include: INCLUDE,
      });
      if (!existing) throw new ApiError(404, "List item not found");

      if (body.assignedToId) {
        if (existing.type !== "NECESSITY") {
          throw new ApiError(400, "assignedToId only applies to NECESSITY items");
        }
        await assertChildMember(req.params.childId, body.assignedToId);
      }
      if (body.calendarEventId) {
        if (existing.type !== "WISHLIST") {
          throw new ApiError(400, "calendarEventId only applies to WISHLIST items");
        }
        const event = await tx.calendarEvent.findFirst({
          where: { id: body.calendarEventId, childId: req.params.childId },
        });
        if (!event) throw new ApiError(404, "Linked calendar event not found");
      }

      await tx.listItem.update({
        where: { id: existing.id },
        data: {
          title: body.title !== undefined ? body.title.trim() : undefined,
          description: body.description !== undefined ? body.description?.trim() || null : undefined,
          sizeValue: body.sizeValue !== undefined ? body.sizeValue?.trim() || null : undefined,
          assignedToId: body.assignedToId !== undefined ? body.assignedToId : undefined,
          calendarEventId: body.calendarEventId !== undefined ? body.calendarEventId : undefined,
          dueOn: optionalDateOnly(body.dueOn, "dueOn"),
        },
      });
      await setListItemImage(tx, existing.id, existing.image?.id ?? null, body.imageAssetId, userId);
      return tx.listItem.findUniqueOrThrow({ where: { id: existing.id }, include: INCLUDE });
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

// Set/change/clear a Necessity's assignment. Unlike claim/reserve, this is
// real delegation — any family member may assign or reassign it to any
// other family member, not just claim it for themselves.
listItemsRouter.patch("/:itemId/assign", requireCapability("list_item:manage"), async (req: Request<ItemParams>, res, next) => {
  try {
    const body = req.body as Partial<UpdateListItemAssignmentRequest>;
    const assignedToId = body.assignedToId ?? null;
    if (assignedToId) {
      await assertChildMember(req.params.childId, assignedToId);
    }

    const row = await withRls(req.session.userId!, async (tx) => {
      const existing = await tx.listItem.findFirst({
        where: { id: req.params.itemId, childId: req.params.childId },
      });
      if (!existing) throw new ApiError(404, "List item not found");

      return tx.listItem.update({
        where: { id: existing.id },
        data: { assignedToId },
        include: INCLUDE,
      });
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

// "I'll get it" (both list types): claim with an optional note, unclaim, or
// edit your own note. `claimed` omitted toggles (older clients). Claimed by
// someone else -> 409 (someone else already stepped up).
listItemsRouter.patch("/:itemId/claim", async (req: Request<ItemParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = (req.body ?? {}) as ClaimListItemRequest;
    const note = optionalText(body.note, "note", 500);
    const row = await withRls(userId, async (tx) => {
      const existing = await tx.listItem.findFirst({
        where: { id: req.params.itemId, childId: req.params.childId },
      });
      if (!existing) throw new ApiError(404, "List item not found");

      if (existing.claimedById && existing.claimedById !== userId) {
        throw new ApiError(409, "This item is already claimed by someone else", "ALREADY_CLAIMED");
      }

      const mine = existing.claimedById === userId;
      const claim = body.claimed ?? (body.note !== undefined && mine ? true : !mine);
      // Conditional update guarded on the claim state we just read, so two
      // concurrent claim/unclaim attempts can't both succeed silently — the
      // loser's updateMany matches zero rows and gets a 409 instead.
      const { count } = await tx.listItem.updateMany({
        where: { id: existing.id, claimedById: existing.claimedById },
        data: claim
          ? {
              claimedById: userId,
              claimedAt: mine ? existing.claimedAt ?? new Date() : new Date(),
              claimNote: note !== undefined ? note : mine ? existing.claimNote : null,
            }
          : { claimedById: null, claimedAt: null, claimNote: null },
      });
      if (count === 0) {
        throw new ApiError(409, "Someone else already changed this item's claim — refresh and try again");
      }

      return tx.listItem.findUniqueOrThrow({
        where: { id: existing.id },
        include: INCLUDE,
      });
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

listItemsRouter.delete("/:itemId", async (req: Request<ItemParams>, res, next) => {
  try {
    const userId = req.session.userId!;
    await withRls(userId, async (tx) => {
      const existing = await tx.listItem.findFirst({
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
      // An unclaimed item's deletion is a "manage" action, not a "claim" one
      // (spec 9.5: a Caregiver may only claim) — a Caregiver deleting their
      // own claim (branch above) is still fine.
      if (!existing.claimedById && (!req.childAccess || !can(req.childAccess, "list_item:manage"))) {
        throw new ApiError(403, "You don't have permission to delete this item");
      }

      await tx.listItem.delete({ where: { id: existing.id } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
