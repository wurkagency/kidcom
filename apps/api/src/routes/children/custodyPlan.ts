import { Router, type Request } from "express";
import type { CustodyPattern, CustodyPlanDto, SetCustodyPlanRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";

// Mounted at /children/:childId/custody-plan. One active plan per child —
// PUT replaces it (see chunk 4 plan: no plan-history UI yet).
export const custodyPlanRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };

function toDto(row: {
  id: string;
  label: string;
  startDate: Date;
  patternDays: unknown;
}): CustodyPlanDto {
  return {
    id: row.id,
    label: row.label,
    startDate: row.startDate.toISOString(),
    patternDays: row.patternDays as CustodyPattern,
  };
}

custodyPlanRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const plan = await prisma.custodyPlan.findFirst({
      where: { childId: req.params.childId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ plan: plan ? toDto(plan) : null });
  } catch (err) {
    next(err);
  }
});

custodyPlanRouter.put("/", async (req: Request<ChildParams>, res, next) => {
  try {
    // Only parents can change the custody schedule — a FAMILY member (e.g. a
    // grandparent) can view it but shouldn't be able to rewrite it. req.childAccess
    // is populated by requireChildAccess (see middleware/childAccess.ts).
    if (req.childAccess?.role !== "PARENT") {
      throw new ApiError(403, "Only parents can edit the custody schedule");
    }

    const body = req.body as Partial<SetCustodyPlanRequest>;
    if (!body.label || !body.startDate || !body.patternDays) {
      throw new ApiError(400, "label, startDate, and patternDays are required");
    }
    if (!body.patternDays.cycleLengthDays || !body.patternDays.blocks?.length) {
      throw new ApiError(400, "patternDays must have a cycleLengthDays and at least one block");
    }

    // Replace any existing plan(s) for this child — one active plan at a
    // time keeps "whose day is it" unambiguous.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.custodyPlan.deleteMany({ where: { childId: req.params.childId } });
      return tx.custodyPlan.create({
        data: {
          childId: req.params.childId,
          label: body.label!,
          startDate: new Date(body.startDate!),
          patternDays: body.patternDays as object,
        },
      });
    });

    res.status(201).json(toDto(plan));
  } catch (err) {
    next(err);
  }
});
