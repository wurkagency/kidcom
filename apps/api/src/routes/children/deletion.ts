import { Router, type Request } from "express";
import type { ChildDeletionActionResponse, ChildDeletionRequestDto } from "@kinnd/shared";

import { prisma } from "../../db";
import { ApiError } from "../../middleware/errorHandler";
import { requiredConfirmerIds } from "../../lib/deletion";

// Mounted at /children/:childId/delete-request and /children/:childId/restore
// (children/index.ts), after requireChildAccess only — deliberately no
// requireChildEntitlement: deletion/restore is account-control, not a paid
// feature, and gating it on billing would mean a lapsed payer can't even
// delete their own child's record.
export const deletionRouter = Router({ mergeParams: true });

type ChildParams = { childId: string };

function toDto(row: { requestedById: string; confirmedByIds: string[]; createdAt: Date } | null, required: string[]): ChildDeletionRequestDto {
  if (!row) return null;
  return {
    requestedById: row.requestedById,
    requiredUserIds: required,
    confirmedUserIds: row.confirmedByIds,
    createdAt: row.createdAt.toISOString(),
  };
}

// This is the one capability in the whole app that's conditional on the
// child's current membership rather than a fixed role column (spec 9.21
// admits this breaks the usual matrix pattern lib/permissions.ts otherwise
// holds to) — so, like custodyPlan.ts's safety-floor check, it's an inline
// check here rather than a MATRIX row.
async function requireConfirmer(childId: string, userId: string): Promise<string[]> {
  const required = await requiredConfirmerIds(childId);
  if (!required.includes(userId)) {
    throw new ApiError(
      403,
      "Only a parent — or, if this child has no parent, a guardian — can manage deleting this child"
    );
  }
  return required;
}

deletionRouter.get("/delete-request", async (req: Request<ChildParams>, res, next) => {
  try {
    const [existing, required] = await Promise.all([
      prisma.childDeletionRequest.findUnique({ where: { childId: req.params.childId } }),
      requiredConfirmerIds(req.params.childId),
    ]);
    res.json({ request: toDto(existing, required) } satisfies { request: ChildDeletionRequestDto });
  } catch (err) {
    next(err);
  }
});

deletionRouter.post("/delete-request", async (req: Request<ChildParams>, res, next) => {
  try {
    const childId = req.params.childId;
    const userId = req.session.userId!;
    const required = await requireConfirmer(childId, userId);

    const existing = await prisma.childDeletionRequest.findUnique({ where: { childId } });
    if (existing) {
      throw new ApiError(409, "A deletion request is already pending for this child — confirm or cancel it instead.");
    }

    if (required.length === 1) {
      // Solo confirmer (a lone parent, or a lone guardian with no parent
      // ever having joined) — nothing to wait on, execute immediately
      // rather than create a request that would be auto-satisfied anyway.
      await prisma.child.update({ where: { id: childId }, data: { deletedAt: new Date() } });
      res.status(201).json({ request: null, executed: true } satisfies ChildDeletionActionResponse);
      return;
    }

    const created = await prisma.childDeletionRequest.create({
      data: { childId, requestedById: userId, confirmedByIds: [userId] },
    });
    res.status(201).json({ request: toDto(created, required), executed: false } satisfies ChildDeletionActionResponse);
  } catch (err) {
    next(err);
  }
});

deletionRouter.post("/delete-request/confirm", async (req: Request<ChildParams>, res, next) => {
  try {
    const childId = req.params.childId;
    const userId = req.session.userId!;
    const required = await requireConfirmer(childId, userId);

    const existing = await prisma.childDeletionRequest.findUnique({ where: { childId } });
    if (!existing) {
      throw new ApiError(404, "No deletion request is pending for this child");
    }

    const confirmedByIds = existing.confirmedByIds.includes(userId)
      ? existing.confirmedByIds
      : [...existing.confirmedByIds, userId];

    const fullyConfirmed = required.every((id) => confirmedByIds.includes(id));
    if (fullyConfirmed) {
      await prisma.$transaction([
        prisma.child.update({ where: { id: childId }, data: { deletedAt: new Date() } }),
        prisma.childDeletionRequest.delete({ where: { childId } }),
      ]);
      res.json({ request: null, executed: true } satisfies ChildDeletionActionResponse);
      return;
    }

    const updated = await prisma.childDeletionRequest.update({
      where: { childId },
      data: { confirmedByIds },
    });
    res.json({ request: toDto(updated, required), executed: false } satisfies ChildDeletionActionResponse);
  } catch (err) {
    next(err);
  }
});

deletionRouter.delete("/delete-request", async (req: Request<ChildParams>, res, next) => {
  try {
    const childId = req.params.childId;
    await requireConfirmer(childId, req.session.userId!);

    const existing = await prisma.childDeletionRequest.findUnique({ where: { childId } });
    if (!existing) {
      throw new ApiError(404, "No deletion request is pending for this child");
    }
    await prisma.childDeletionRequest.delete({ where: { childId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Exported so lib/childPurge.ts's hard-delete job (post-launch backlog
// Phase H) uses the exact same figure as this restore-window check, rather
// than a second "30" magic number that could drift out of sync.
export const RESTORE_WINDOW_DAYS = 30;

deletionRouter.post("/restore", async (req: Request<ChildParams>, res, next) => {
  try {
    const childId = req.params.childId;
    const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    if (!child.deletedAt) {
      throw new ApiError(400, "This child isn't deleted");
    }
    const ageMs = Date.now() - child.deletedAt.getTime();
    if (ageMs > RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      throw new ApiError(410, "The 30-day restore window for this child has passed");
    }

    // Restoring is a single-confirmer undo, not a repeat of the all-confirm
    // deletion vote — spec 9.21 only mandates the multi-confirm workflow for
    // the deletion itself.
    await requireConfirmer(childId, req.session.userId!);

    await prisma.child.update({ where: { id: childId }, data: { deletedAt: null } });
    res.status(200).json({ restored: true });
  } catch (err) {
    next(err);
  }
});
