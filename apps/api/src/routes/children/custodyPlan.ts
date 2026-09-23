import { Router, type Request } from "express";
import type { CustodyPattern, CustodyPlanDto, CustodyPlanStatusResponse, SetCustodyPlanRequest } from "@kidcom/shared";

import { ApiError } from "../../middleware/errorHandler";
import { requireCapability } from "../../lib/permissions";
import { getCustodyPlanLockStatus, isChildSatisfied, isCustodyPlanLockedPendingParent } from "../../lib/entitlement";
import { withRls } from "../../lib/rls";

// Mounted at /children/:childId/custody-plan. One active plan per child —
// PUT replaces it (see chunk 4 plan: no plan-history UI yet).
export const custodyPlanRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };

export function toCustodyPlanDto(row: {
  id: string;
  label: string;
  startDate: Date;
  patternDays: unknown;
  handoverTime: string | null;
  handoverLocation: string | null;
}): CustodyPlanDto {
  return {
    id: row.id,
    label: row.label,
    startDate: row.startDate.toISOString(),
    patternDays: row.patternDays as CustodyPattern,
    handoverTime: row.handoverTime,
    handoverLocation: row.handoverLocation,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

custodyPlanRouter.get("/", async (req: Request<ChildParams>, res, next) => {
  try {
    const [plan, lockStatus] = await Promise.all([
      withRls(req.session.userId!, (tx) =>
        tx.custodyPlan.findFirst({
          where: { childId: req.params.childId },
          orderBy: { createdAt: "desc" },
        })
      ),
      getCustodyPlanLockStatus(req.params.childId),
    ]);
    res.json({
      plan: plan ? toCustodyPlanDto(plan) : null,
      locked: lockStatus.locked,
      daysUntilLocked: lockStatus.daysUntilLocked,
    } satisfies CustodyPlanStatusResponse);
  } catch (err) {
    next(err);
  }
});

custodyPlanRouter.put("/", requireCapability("custody_plan:edit"), async (req: Request<ChildParams>, res, next) => {
  try {
    // spec 9.8 — locked once a child has gone 30 days with only one parent
    // ever having joined, regardless of who's asking (including that sole
    // parent themselves) — the lock exists specifically so one home can't
    // unilaterally cement a schedule before the other one is even present.
    if (await isCustodyPlanLockedPendingParent(req.params.childId)) {
      throw new ApiError(
        403,
        "This child's custody plan is locked until a second parent joins — invite them, or ask support if that's not possible."
      );
    }

    // spec §4.2 pt.2 — the safety floor: a PARENT-role member's custody-plan
    // writes never lapse for billing reasons, on any tier, ever. requireCapability
    // above already limited this route to PARENT/GUARDIAN; only GUARDIAN is
    // still subject to the normal entitlement gate (spec §4.2/Phase 9 —
    // deliberate, load-bearing for closing off a bootstrap guardian squatting
    // on a child for free).
    if (req.childAccess?.role !== "PARENT" && !(await isChildSatisfied(req.params.childId))) {
      throw new ApiError(
        403,
        "This child's circle needs a paid plan to keep editing — upgrade to keep everyone's access active."
      );
    }

    const body = req.body as Partial<SetCustodyPlanRequest>;
    if (!body.label || !body.startDate || !body.patternDays) {
      throw new ApiError(400, "label, startDate, and patternDays are required");
    }
    if (!body.patternDays.cycleLengthDays || !body.patternDays.blocks?.length) {
      throw new ApiError(400, "patternDays must have a cycleLengthDays and at least one block");
    }
    if (body.handoverTime != null && !HHMM.test(body.handoverTime)) {
      throw new ApiError(400, "handoverTime must be HH:mm");
    }

    // Replace any existing plan(s) for this child — one active plan at a
    // time keeps "whose day is it" unambiguous.
    const plan = await withRls(req.session.userId!, async (tx) => {
      await tx.custodyPlan.deleteMany({ where: { childId: req.params.childId } });
      return tx.custodyPlan.create({
        data: {
          childId: req.params.childId,
          label: body.label!,
          startDate: new Date(body.startDate!),
          patternDays: body.patternDays as object,
          handoverTime: body.handoverTime ?? null,
          handoverLocation: body.handoverLocation?.trim() || null,
        },
      });
    });

    res.status(201).json(toCustodyPlanDto(plan));
  } catch (err) {
    next(err);
  }
});
