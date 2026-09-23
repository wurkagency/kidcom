import { Router, type Request } from "express";
import type { Prisma } from "@kidcom/db";
import type { CustodyPattern, HandoverPackingItemDto, SetHandoverPackingRequest, ToggleHandoverPackingRequest } from "@kidcom/shared";
import { findNextHandover } from "@kidcom/shared";

import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { withRls } from "../../lib/rls";
import { copenhagenToday, dateOnlyString, requiredText } from "../../lib/validation";

// Mounted at /children/:childId/handover-packing — "Handover Packing, 3 of 4
// items packed". Items are packed *for* a handover date, so the list resets
// itself for every new handover. Parents/guardians edit the list; anyone in
// the family can tick items.
export const handoverPackingRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ItemParams = { childId: string; id: string };

/** The handover the list is being packed for: the next change of hands, else today. */
export async function packingDate(tx: Prisma.TransactionClient, childId: string): Promise<string> {
  const today = copenhagenToday();
  const plan = await tx.custodyPlan.findFirst({ where: { childId }, orderBy: { createdAt: "desc" } });
  if (!plan) return today;
  const next = findNextHandover({ startDate: plan.startDate, patternDays: plan.patternDays as CustodyPattern }, today);
  return next?.date ?? today;
}

export function toPackingItemDto(
  row: { id: string; label: string; sortOrder: number; packedFor: Date | null },
  forDate: string,
): HandoverPackingItemDto {
  return { id: row.id, label: row.label, sortOrder: row.sortOrder, packed: dateOnlyString(row.packedFor) === forDate };
}

async function list(tx: Prisma.TransactionClient, childId: string) {
  const forDate = await packingDate(tx, childId);
  const rows = await tx.handoverPackingItem.findMany({ where: { childId }, orderBy: { sortOrder: "asc" } });
  return { forDate, items: rows.map((r) => toPackingItemDto(r, forDate)) };
}

handoverPackingRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    res.json(await withRls(req.session.userId!, (tx) => list(tx, req.params.childId)));
  } catch (err) {
    next(err);
  }
});

/** Replaces the list's labels and order. Items sent with an id keep their packed state. */
handoverPackingRouter.put("/", requireCapability("packing:manage"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<SetHandoverPackingRequest>;
    if (!Array.isArray(body.items) || body.items.length > 50) throw new ApiError(400, "items must be a list of up to 50");
    const items = body.items.map((item, i) => ({ id: typeof item.id === "string" ? item.id : undefined, label: requiredText(item.label, `items[${i}].label`, 100) }));
    const result = await withRls(req.session.userId!, async (tx) => {
      const keep = items.flatMap((i) => (i.id ? [i.id] : []));
      await tx.handoverPackingItem.deleteMany({ where: { childId: req.params.childId, id: { notIn: keep } } });
      for (const [sortOrder, item] of items.entries()) {
        if (item.id) {
          const { count } = await tx.handoverPackingItem.updateMany({
            where: { id: item.id, childId: req.params.childId },
            data: { label: item.label, sortOrder },
          });
          if (count === 0) throw new ApiError(400, "Unknown packing item");
        } else {
          await tx.handoverPackingItem.create({ data: { childId: req.params.childId, label: item.label, sortOrder } });
        }
      }
      return list(tx, req.params.childId);
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

handoverPackingRouter.patch("/:id", async (req: Request<ItemParams>, res, next) => {
  try {
    const body = req.body as Partial<ToggleHandoverPackingRequest>;
    if (typeof body.packed !== "boolean") throw new ApiError(400, "packed must be true or false");
    const result = await withRls(req.session.userId!, async (tx) => {
      const forDate = await packingDate(tx, req.params.childId);
      const { count } = await tx.handoverPackingItem.updateMany({
        where: { id: req.params.id, childId: req.params.childId },
        data: { packedFor: body.packed ? new Date(`${forDate}T00:00:00Z`) : null },
      });
      if (count === 0) throw new ApiError(404, "Packing item not found");
      return list(tx, req.params.childId);
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
