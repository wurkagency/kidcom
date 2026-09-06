import { Router } from "express";
import type { ChildDetail, ChildSummary, CreateChildRequest, UpdateChildRequest } from "@kidcom/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { requireChildAccess } from "../../middleware/childAccess";
import { requireActiveAccess, effectiveTier } from "../../middleware/billing";
import { ApiError } from "../../middleware/errorHandler";
import { childCapForTier } from "../../lib/billingPricing";
import { medicalInfoRouter } from "./medicalInfo";
import { growthEntriesRouter } from "./growthEntries";
import { emergencyContactsRouter } from "./emergencyContacts";
import { scheduleRouter } from "./schedule";
import { custodyPlanRouter } from "./custodyPlan";
import { calendarRouter } from "./calendar";
import { calendarEventsRouter } from "./calendarEvents";
import { swapRequestsRouter } from "./swapRequests";
import { journalRouter } from "./journal";
import { listItemsRouter } from "./listItems";

export const childrenRouter = Router();

childrenRouter.use(requireAuth);

// Applies the trial-expiry gate (see middleware/billing.ts) to every
// mutating request under /children — GET requests (viewing) stay open.
// One rule here instead of touching every sub-route file individually.
childrenRouter.use((req, res, next) => {
  if (req.method === "GET") {
    next();
    return;
  }
  requireActiveAccess(req, res, next);
});

// Sub-routers mounted below all use `mergeParams: true` so they see the
// `:childId` param from these mount paths, and all go through
// requireChildAccess (built in chunk 2) before touching anything.
childrenRouter.use("/:childId/medical-info", requireChildAccess, medicalInfoRouter);
childrenRouter.use("/:childId/growth-entries", requireChildAccess, growthEntriesRouter);
childrenRouter.use("/:childId/emergency-contacts", requireChildAccess, emergencyContactsRouter);
childrenRouter.use("/:childId/schedule", requireChildAccess, scheduleRouter);
childrenRouter.use("/:childId/custody-plan", requireChildAccess, custodyPlanRouter);
childrenRouter.use("/:childId/calendar", requireChildAccess, calendarRouter);
childrenRouter.use("/:childId/calendar-events", requireChildAccess, calendarEventsRouter);
childrenRouter.use("/:childId/swap-requests", requireChildAccess, swapRequestsRouter);
childrenRouter.use("/:childId/journal", requireChildAccess, journalRouter);
childrenRouter.use("/:childId/lists", requireChildAccess, listItemsRouter);

function toChildSummary(child: {
  id: string;
  firstName: string;
  lastName: string;
  gender: "BOY" | "GIRL" | "OTHER";
  birthday: Date;
  profileImageUrl: string | null;
  clothingSize: string | null;
  shoeSize: string | null;
}): ChildSummary {
  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    gender: child.gender,
    birthday: child.birthday.toISOString(),
    profileImageUrl: child.profileImageUrl,
    clothingSize: child.clothingSize,
    shoeSize: child.shoeSize,
  };
}

// Lists only the children the caller has ChildAccess to (not all children in
// the system) — this is the "which household am I in" query in practice,
// since we don't model a separate Household entity (see chunk 2 plan notes).
childrenRouter.get("/", async (req, res, next) => {
  try {
    const children = await prisma.child.findMany({
      where: { access: { some: { userId: req.session.userId! } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({ children: children.map(toChildSummary) });
  } catch (err) {
    next(err);
  }
});

childrenRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as Partial<CreateChildRequest>;
    const { firstName, gender, birthday } = body;

    if (!firstName || !gender || !birthday) {
      throw new ApiError(400, "firstName, gender, and birthday are required");
    }

    // Free and Parents cap at 1 child, Family is unlimited (PRD pricing
    // section) — counted as however many children this user currently has
    // PARENT-role ChildAccess to, however they got it.
    const [subscription, existingCount] = await Promise.all([
      prisma.subscription.upsert({
        where: { ownerId: req.session.userId! },
        update: {},
        create: { ownerId: req.session.userId! },
      }),
      prisma.childAccess.count({ where: { userId: req.session.userId!, role: "PARENT" } }),
    ]);
    const tier = effectiveTier(subscription);
    const cap = childCapForTier(tier);
    if (existingCount >= cap) {
      throw new ApiError(
        403,
        tier === "FAMILY"
          ? "You've reached your child limit"
          : "Your current plan is limited to 1 child — upgrade to Family for unlimited children"
      );
    }

    const child = await prisma.$transaction(async (tx) => {
      const created = await tx.child.create({
        data: {
          firstName,
          lastName: body.lastName ?? "",
          gender,
          birthday: new Date(birthday),
          clothingSize: body.clothingSize,
          shoeSize: body.shoeSize,
        },
      });
      await tx.childAccess.create({
        data: { childId: created.id, userId: req.session.userId!, role: "PARENT" },
      });
      return created;
    });

    res.status(201).json(toChildSummary(child));
  } catch (err) {
    next(err);
  }
});

// Full detail for the child_profile screen — kept separate from the list
// endpoint's ChildSummary since this includes heightCm/countryCode that the
// list view doesn't need.
childrenRouter.get("/:childId", requireChildAccess, async (req, res, next) => {
  try {
    const child = await prisma.child.findUniqueOrThrow({ where: { id: req.params.childId } });
    const detail: ChildDetail = {
      ...toChildSummary(child),
      heightCm: child.heightCm,
      countryCode: child.countryCode,
    };
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

childrenRouter.patch("/:childId", requireChildAccess, async (req, res, next) => {
  try {
    const body = req.body as UpdateChildRequest;

    // A new photo goes through the same asset-ownership check + swap
    // pattern as PATCH /auth/me: the asset must belong to the requester,
    // and the old asset's avatarForChildId is cleared in the same
    // transaction as the new one is set so no two assets ever claim this
    // child's avatar at once.
    if (body.profileImageMediaAssetId) {
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: body.profileImageMediaAssetId },
      });
      if (!asset) {
        throw new ApiError(404, "Media not found");
      }
      if (asset.ownerId !== req.session.userId) {
        throw new ApiError(403, "You don't have access to this media");
      }
      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.updateMany({
          where: { avatarForChildId: req.params.childId },
          data: { avatarForChildId: null },
        });
        await tx.mediaAsset.update({
          where: { id: body.profileImageMediaAssetId },
          data: { avatarForChildId: req.params.childId },
        });
      });
    }

    const child = await prisma.child.update({
      where: { id: req.params.childId },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        gender: body.gender,
        birthday: body.birthday ? new Date(body.birthday) : undefined,
        heightCm: body.heightCm,
        clothingSize: body.clothingSize,
        shoeSize: body.shoeSize,
        profileImageUrl: body.profileImageMediaAssetId,
      },
    });
    const detail: ChildDetail = {
      ...toChildSummary(child),
      heightCm: child.heightCm,
      countryCode: child.countryCode,
    };
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// Family & Connections — derived from ChildAccess + User rather than stored,
// so Mom/Dad/family show up automatically without re-entering them (matches
// the child_profile mockup's "Family & Connections" section).
childrenRouter.get("/:childId/family", requireChildAccess, async (req, res, next) => {
  try {
    const access = await prisma.childAccess.findMany({
      where: { childId: req.params.childId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      members: access.map((a) => ({
        userId: a.userId,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        role: a.role,
        familyMemberType: a.familyMemberType,
      })),
    });
  } catch (err) {
    next(err);
  }
});
