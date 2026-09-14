import { Router, type Request } from "express";
import type { CreateGrowthEntryRequest, GrowthEntryDto, UpdateGrowthEntryRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";

// Mounted at /children/:childId/growth-entries.
export const growthEntriesRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };
type ChildEntryParams = { childId: string; id: string };

function toDto(row: {
  id: string;
  measuredAt: Date;
  heightCm: number | null;
  weightKg: number | null;
  note: string | null;
}): GrowthEntryDto {
  return {
    id: row.id,
    measuredAt: row.measuredAt.toISOString(),
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    note: row.note,
  };
}

// The child's headline heightCm (shown on the profile screen) should always
// reflect the most recent logged measurement by measuredAt, not simply
// whatever was last created/edited — an out-of-order backfill (e.g. adding a
// measurement from last month after already logging this month's) must not
// clobber a newer value. Re-derive it from scratch after every mutation
// instead of special-casing each one.
async function recomputeHeadlineHeight(childId: string) {
  const mostRecent = await prisma.growthEntry.findFirst({
    where: { childId, heightCm: { not: null } },
    orderBy: { measuredAt: "desc" },
  });
  await prisma.child.update({
    where: { id: childId },
    data: { heightCm: mostRecent?.heightCm ?? null },
  });
}

// Oldest-first — this is what the growth chart plots directly.
growthEntriesRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const rows = await prisma.growthEntry.findMany({
      where: { childId: req.params.childId },
      orderBy: { measuredAt: "asc" },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});

growthEntriesRouter.post("/", requireCapability("growth_entry:manage"), async (req: Request<ChildParams>, res, next) => {
  try {
    const body = req.body as Partial<CreateGrowthEntryRequest>;
    if (!body.measuredAt || (body.heightCm === undefined && body.weightKg === undefined)) {
      throw new ApiError(400, "measuredAt and at least one of heightCm/weightKg are required");
    }
    const row = await prisma.growthEntry.create({
      data: {
        childId: req.params.childId,
        measuredAt: new Date(body.measuredAt),
        heightCm: body.heightCm,
        weightKg: body.weightKg,
        note: body.note,
      },
    });

    await recomputeHeadlineHeight(req.params.childId);

    res.status(201).json(toDto(row));
  } catch (err) {
    next(err);
  }
});

growthEntriesRouter.patch("/:id", requireCapability("growth_entry:manage"), async (req: Request<ChildEntryParams>, res, next) => {
  try {
    const body = req.body as UpdateGrowthEntryRequest;
    const existing = await prisma.growthEntry.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Growth entry not found");

    const row = await prisma.growthEntry.update({
      where: { id: req.params.id },
      data: {
        measuredAt: body.measuredAt ? new Date(body.measuredAt) : undefined,
        heightCm: body.heightCm,
        weightKg: body.weightKg,
        note: body.note,
      },
    });

    await recomputeHeadlineHeight(req.params.childId);

    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

growthEntriesRouter.delete("/:id", requireCapability("growth_entry:manage"), async (req: Request<ChildEntryParams>, res, next) => {
  try {
    const existing = await prisma.growthEntry.findFirst({
      where: { id: req.params.id, childId: req.params.childId },
    });
    if (!existing) throw new ApiError(404, "Growth entry not found");

    await prisma.growthEntry.delete({ where: { id: req.params.id } });

    await recomputeHeadlineHeight(req.params.childId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
