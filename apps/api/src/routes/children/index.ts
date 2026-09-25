import { Router } from "express";
import type {
  AccessRole,
  ChildDetail,
  ChildGender,
  ChildSummary,
  CreateChildRequest,
  CreateChildResponse,
  CreateMinorMemberRequest,
  MinorMemberDto,
  MoveChildRequest,
  RelationshipType,
  UpdateChildRequest,
  SubscriptionTier,
  SuspendedChildDto,
  UpdateMemberRelationshipRequest,
} from "@kinnd/shared";
import { ALL_RELATIONSHIP_TYPES, TIERS, isParentShapedRelationship, isValidEmail } from "@kinnd/shared";

const CHILD_GENDERS: ChildGender[] = ["BOY", "GIRL", "OTHER"];
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth, requireVerifiedEmail } from "../../middleware/session";
import { requireChildAccess } from "../../middleware/childAccess";
import { ApiError } from "../../middleware/errorHandler";
import { can, requireCapability, type Capability } from "../../lib/permissions";
import { logAccessGrant } from "../../lib/accessGrantAnalytics";
import { requireTierFeature } from "../../lib/entitlement";
import { childCapacity, childTier, childTiers, heldCircles } from "../../lib/circles";
import { moveChildToCircle } from "../../lib/circleLifecycle";
import { assertUnderChildFairUseCap, assertUnderMemberFairUseCap } from "../../lib/fairUseCaps";
import { mailSender } from "../../lib/mailSender";
import { withRls } from "../../lib/rls";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { deletionRouter } from "./deletion";
import { medicalInfoRouter } from "./medicalInfo";
import { growthEntriesRouter } from "./growthEntries";
import { emergencyContactsRouter } from "./emergencyContacts";
import { scheduleRouter } from "./schedule";
import { custodyPlanRouter } from "./custodyPlan";
import { calendarRouter } from "./calendar";
import { calendarEventsRouter } from "./calendarEvents";
import { calendarEventRequestsRouter } from "./calendarEventRequests";
import { swapRequestsRouter } from "./swapRequests";
import { momentsRouter } from "./moments";
import { listItemsRouter } from "./listItems";
import { tasksRouter } from "./tasks";
import { childNotesRouter } from "./notes";
import { schoolLessonsRouter } from "./schoolLessons";
import { handoverPackingRouter } from "./handoverPacking";
import { notify } from "../../lib/notify";

export const childrenRouter = Router();

childrenRouter.use(requireAuth);

// Registered before the /:childId mounts: a suspended child has no live
// access rows, so requireChildAccess would refuse its parents here.
childrenRouter.get("/suspended", async (req, res, next) => {
  try {
    const rows = await prisma.suspendedChildAccess.findMany({
      where: { userId: req.session.userId!, reason: "CHILD_SUSPENDED", role: { in: ["PARENT", "GUARDIAN"] } },
      include: { child: true },
    });
    const circles = await heldCircles(req.session.userId!);
    const room = await Promise.all(
      circles.map(async (h) => (await prisma.child.count({ where: { circleId: h.circle.id, deletedAt: null } })) < TIERS[h.circle.tier].children)
    );
    const canTakeOver = room.some(Boolean);
    res.json({
      children: rows
        .filter((r) => r.child.suspendedAt && !r.child.deletedAt)
        .map(
          (r): SuspendedChildDto => ({
            id: r.child.id,
            firstName: r.child.firstName,
            lastName: r.child.lastName,
            suspendedAt: r.child.suspendedAt!.toISOString(),
            deleteAfter: r.child.deleteAfter!.toISOString(),
            canTakeOver,
          })
        ),
    });
  } catch (err) {
    next(err);
  }
});

// D4 take-over: a parent or guardian moves the child into a Circle they own
// or are a parent member of (also restores a suspended child, D5).
childrenRouter.post("/:childId/move", async (req, res, next) => {
  try {
    const { circleId } = req.body as Partial<MoveChildRequest>;
    if (!circleId) throw new ApiError(400, "circleId is required");
    await moveChildToCircle(req.params.childId, req.session.userId!, circleId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});


// Subscription model rule 1: a child's features come from its Circle's tier.
// Only custody planning (schedules and swaps) is gated per route here; the
// Media Library is gated where it's listed (moments media), and invites and
// child limits where they're created. Reads of everything else stay open on
// every tier. Sub-routers use `mergeParams: true` to see `:childId`.
childrenRouter.use("/:childId/medical-info", requireChildAccess, medicalInfoRouter);
childrenRouter.use("/:childId/growth-entries", requireChildAccess, growthEntriesRouter);
childrenRouter.use("/:childId/emergency-contacts", requireChildAccess, emergencyContactsRouter);
childrenRouter.use("/:childId/schedule", requireChildAccess, scheduleRouter);
childrenRouter.use("/:childId/custody-plan", requireChildAccess, requireTierFeature("custodyPlanning"), custodyPlanRouter);
childrenRouter.use("/:childId/calendar", requireChildAccess, calendarRouter);
childrenRouter.use("/:childId/calendar-events", requireChildAccess, calendarEventsRouter);
childrenRouter.use("/:childId/calendar-event-requests", requireChildAccess, calendarEventRequestsRouter);
childrenRouter.use("/:childId/swap-requests", requireChildAccess, requireTierFeature("custodyPlanning"), swapRequestsRouter);
childrenRouter.use("/:childId/moments", requireChildAccess, momentsRouter);
childrenRouter.use("/:childId/lists", requireChildAccess, listItemsRouter);
childrenRouter.use("/:childId/tasks", requireChildAccess, tasksRouter);
childrenRouter.use("/:childId/notes", requireChildAccess, childNotesRouter);
childrenRouter.use("/:childId/school-lessons", requireChildAccess, schoolLessonsRouter);
childrenRouter.use("/:childId/handover-packing", requireChildAccess, handoverPackingRouter);
childrenRouter.use("/:childId", requireChildAccess, deletionRouter);

type MyAccess = { role: AccessRole; relationship: RelationshipType | null; isMinorMember?: boolean };

function toChildSummary(
  child: {
    id: string;
    firstName: string;
    lastName: string;
    gender: "BOY" | "GIRL" | "OTHER";
    birthday: Date;
    profileImageUrl: string | null;
    clothingSize: string | null;
    shoeSize: string | null;
    coverImageUrl: string | null;
  },
  me: MyAccess,
  tier: SubscriptionTier,
): ChildSummary {
  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    gender: child.gender,
    birthday: child.birthday.toISOString(),
    profileImageUrl: child.profileImageUrl,
    clothingSize: child.clothingSize,
    shoeSize: child.shoeSize,
    coverImageUrl: child.coverImageUrl,
    myRole: me.role,
    myRelationship: me.relationship,
    canEdit: can(me, "child:edit_basic_info"),
    tier,
  };
}

// Lists only the children the caller has ChildAccess to (not all children in
// the system) — this is the "which household am I in" query in practice,
// since we don't model a separate Household entity (see chunk 2 plan notes).
childrenRouter.get("/", async (req, res, next) => {
  try {
    const children = await prisma.child.findMany({
      // Phase 10 (spec 9.21) — a soft-deleted child drops out of normal use
      // immediately; it's still readable directly by id during its 30-day
      // restore window (GET /:childId doesn't filter on deletedAt), just not
      // listed here.
      where: { deletedAt: null, access: { some: { userId: req.session.userId! } } },
      include: { access: { where: { userId: req.session.userId! }, take: 1 } },
      orderBy: { createdAt: "asc" },
    });
    const tiers = await childTiers(children.map((c) => c.id));
    res.json({ children: children.map((c) => toChildSummary(c, c.access[0]!, tiers.get(c.id) ?? "FREE")) });
  } catch (err) {
    next(err);
  }
});

childrenRouter.post("/", requireVerifiedEmail, async (req, res, next) => {
  try {
    const body = req.body as Partial<CreateChildRequest>;
    const { firstName, gender, birthday } = body;

    if (!firstName || !gender || !birthday) {
      throw new ApiError(400, "firstName, gender, and birthday are required");
    }
    if (!CHILD_GENDERS.includes(gender)) {
      throw new ApiError(400, "gender must be one of BOY, GIRL, OTHER");
    }
    // spec §1.3: this is where "what's your relationship to this child"
    // now gets asked, not at account-creation time.
    const relationship = body.relationship ?? "PARENT";
    if (!ALL_RELATIONSHIP_TYPES.includes(relationship)) {
      throw new ApiError(400, "relationship is not a recognized value");
    }

    // D5 fix (spec §1.4b, 9.23): a parent-shaped self-declaration gets role
    // PARENT, same as before. Any other relationship — deliberately every
    // non-parent RelationshipType is allowed to bootstrap-create a child;
    // the spec doesn't gate *which* relationships may (brief §5's flagged
    // open item), so this states that choice plainly rather than letting
    // an arbitrary UI subset become the de facto policy — gets a bootstrap
    // GUARDIAN grant instead: never role FAMILY (which could never cover
    // the child — spec §2.2 Consequence 1), and NOT routed through
    // relationshipTypeToRole (that function answers "what role does an
    // *invitee* onto an existing child get," a different question).
    const isBootstrapGuardian = !isParentShapedRelationship(relationship);
    const role = isBootstrapGuardian ? "GUARDIAN" : "PARENT";

    // spec §2.2b point 1 — required, not optional, when the creator's own
    // grant resolves to GUARDIAN: this is what makes "every child has a
    // parent" a real invariant instead of a hope. At least a name, plus
    // email and/or an explicit claim-link opt-in (point 3 — for when she
    // doesn't have contact info on hand).
    let parentContact: { name: string; email?: string; wantsClaimLink: boolean } | undefined;
    if (isBootstrapGuardian) {
      const contact = body.parentContact;
      if (!contact?.name?.trim()) {
        throw new ApiError(400, "A parent's name is required when you're not this child's parent yourself");
      }
      const email = contact.email?.trim().toLowerCase();
      if (email && !isValidEmail(email)) {
        throw new ApiError(400, "Please enter a valid email address for the parent");
      }
      if (!email && !contact.phone && !contact.wantsClaimLink) {
        throw new ApiError(
          400,
          "Provide the parent's email or phone, or share a claim link instead — one of these is required"
        );
      }
      parentContact = { name: contact.name.trim(), email, wantsClaimLink: !email };
    }

    // spec 9.10 — the fair-use soft cap, unlike the FREE-tier cap just below:
    // applies at every tier and to every creation path (bootstrap included).
    // This is what actually bounds mass solo-bootstrap-creation (the pattern
    // flagged in bootstrapGuardian.test.ts's Scenario 3 test, since a lone
    // GUARDIAN's one child stays entitlement-satisfied forever at FREE tier).
    await assertUnderChildFairUseCap(req.session.userId!);

    // Rule 1: children count against the Circle the creator adds to (their
    // own, else the Family Circle they're a parent member of), or against
    // their free Single (2). The new child goes into that Circle.
    const capacity = await childCapacity(req.session.userId!);
    if (capacity.used >= capacity.limit) {
      throw new ApiError(403, `Your plan allows ${capacity.limit} children`, "CHILD_LIMIT", {
        limit: capacity.limit,
        inCircle: capacity.circleId !== null,
      });
    }

    const { child, invite } = await prisma.$transaction(async (tx) => {
      const created = await tx.child.create({
        data: {
          firstName,
          lastName: body.lastName ?? "",
          gender,
          birthday: new Date(birthday),
          clothingSize: body.clothingSize,
          shoeSize: body.shoeSize,
          circleId: capacity.circleId,
        },
      });
      await tx.childAccess.create({
        data: { childId: created.id, userId: req.session.userId!, role, relationship },
      });

      // spec §2.2b points 2-3 — send the invite immediately (or prepare a
      // shareable claim-link), pre-filled with everything already entered.
      // Neutral PARENT relationship: the bootstrap creator was only asked
      // to name a *contact*, not declare whether that person is the
      // father or mother — that's the invitee's own business, same as any
      // other invite reaching an existing child.
      let createdInvite = null;
      if (parentContact) {
        createdInvite = await tx.invite.create({
          data: {
            childId: created.id,
            role: "PARENT",
            relationship: "PARENT",
            email: parentContact.email ?? null,
            invitedById: req.session.userId!,
            trialEndsAt: new Date(Date.now() + THIRTY_DAYS_MS),
          },
        });
      }

      return { child: created, invite: createdInvite };
    });

    // Phase 6a (spec 9.20): a bootstrap grant — no inviter, no accept delay.
    await logAccessGrant({ relationship });

    let parentInvite: CreateChildResponse["parentInvite"];
    if (invite && parentContact) {
      let emailSent = false;
      if (parentContact.email) {
        const acceptUrl = `${config.corsOrigin[0]}/invite/${invite.token}`;
        try {
          await mailSender.send({
            to: parentContact.email,
            subject: `${firstName} needs you on Kinnd`,
            text: `You've been listed as ${firstName}'s parent on Kinnd. Accept here to see ${firstName}'s schedule and memories: ${acceptUrl}\n\nThis link starts a 30-day free trial.`,
          });
          emailSent = true;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Failed to send bootstrap parent-contact invite ${invite.id}:`, err);
        }
      }
      parentInvite = { token: invite.token, emailSent };
    }

    const tier: SubscriptionTier = capacity.circleId ? await childTier(child.id) : "FREE";
    res.status(201).json({ ...toChildSummary(child, { role, relationship }, tier), parentInvite } satisfies CreateChildResponse);
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
      ...toChildSummary(child, req.childAccess!, await childTier(child.id)),
      heightCm: child.heightCm,
      countryCode: child.countryCode,
    };
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

childrenRouter.patch(
  "/:childId",
  requireChildAccess,
  requireCapability("child:edit_basic_info"),
  async (req, res, next) => {
  try {
    const body = req.body as UpdateChildRequest;

    // A new photo goes through the same asset-ownership check + swap
    // pattern as PATCH /auth/me: the asset must belong to the requester,
    // and the old asset's avatarForChildId is cleared in the same
    // transaction as the new one is set so no two assets ever claim this
    // child's avatar at once.
    if (body.profileImageMediaAssetId) {
      const profileImageMediaAssetId = body.profileImageMediaAssetId;
      await withRls(req.session.userId!, async (tx) => {
        const asset = await tx.mediaAsset.findUnique({
          where: { id: profileImageMediaAssetId },
        });
        if (!asset) {
          throw new ApiError(404, "Media not found");
        }
        if (asset.ownerId !== req.session.userId) {
          throw new ApiError(403, "You don't have access to this media");
        }
        await tx.mediaAsset.updateMany({
          where: { avatarForChildId: req.params.childId },
          data: { avatarForChildId: null },
        });
        await tx.mediaAsset.update({
          where: { id: profileImageMediaAssetId },
          data: { avatarForChildId: req.params.childId },
        });
      });
    }

    // The cover photo: same ownership check + swap as the avatar above.
    if (body.coverImageMediaAssetId) {
      const coverId = body.coverImageMediaAssetId;
      await withRls(req.session.userId!, async (tx) => {
        const asset = await tx.mediaAsset.findUnique({ where: { id: coverId } });
        if (!asset) throw new ApiError(404, "Media not found");
        if (asset.ownerId !== req.session.userId) throw new ApiError(403, "You don't have access to this media");
        await tx.mediaAsset.updateMany({ where: { coverForChildId: req.params.childId }, data: { coverForChildId: null } });
        await tx.mediaAsset.update({ where: { id: coverId }, data: { coverForChildId: req.params.childId } });
      });
    }

    if (body.gender !== undefined && !CHILD_GENDERS.includes(body.gender)) {
      throw new ApiError(400, "gender must be one of BOY, GIRL, OTHER");
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
        coverImageUrl: body.coverImageMediaAssetId,
      },
    });
    const detail: ChildDetail = {
      ...toChildSummary(child, req.childAccess!, await childTier(child.id)),
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
    const [access, invites] = await Promise.all([
      prisma.childAccess.findMany({
        where: { childId: req.params.childId },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.invite.findMany({
        where: { childId: req.params.childId, acceptedAt: { not: null } },
        select: { email: true, invitedById: true },
        orderBy: { acceptedAt: "desc" },
      }),
    ]);
    const inviterByEmail = new Map(invites.filter((i) => i.email).map((i) => [i.email!.toLowerCase(), i.invitedById]));
    res.json({
      members: access.map((a) => ({
        userId: a.userId,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        avatarUrl: a.user.avatarUrl,
        role: a.role,
        relationship: a.relationship,
        isMinorMember: a.isMinorMember,
        invitedByUserId: inviterByEmail.get(a.user.email.toLowerCase()) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// spec 9.16 — a sibling's own account, created directly by a parent rather
// than through the normal email-invite flow (see the BROTHER/SISTER block in
// routes/invites/index.ts for the other half of this). No password set here
// — a random, never-surfaced hash, since the parent is managing this on the
// child's behalf, not handing the sibling credentials of their own; a real
// "claim your account" flow for the minor themselves is out of scope for
// this phase.
childrenRouter.post("/:childId/family/minor", requireChildAccess, async (req, res, next) => {
  try {
    // PARENT-only (spec 9.16: "a parent creates the account") — narrower
    // than the usual member:invite_family_or_caregiver capability, which a
    // GUARDIAN also has; a plain requireCapability check here would wrongly
    // let a guardian create a minor's account too.
    if (req.childAccess?.role !== "PARENT") {
      throw new ApiError(403, "Only a parent can add a sibling's account");
    }
    const body = req.body as Partial<CreateMinorMemberRequest>;
    if (!body.firstName || (body.relationship !== "BROTHER" && body.relationship !== "SISTER")) {
      throw new ApiError(400, "firstName and relationship (BROTHER or SISTER) are required");
    }

    await assertUnderMemberFairUseCap(req.params.childId);

    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: `minor-${randomBytes(12).toString("hex")}@kinnd.invalid`,
          passwordHash,
          firstName: body.firstName!,
          lastName: body.lastName ?? "",
        },
      });
      await tx.childAccess.create({
        data: {
          childId: req.params.childId,
          userId: created.id,
          role: "FAMILY",
          relationship: body.relationship!,
          isMinorMember: true,
        },
      });
      return created;
    });

    res.status(201).json({
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      relationship: body.relationship!,
    } satisfies MinorMemberDto);
  } catch (err) {
    next(err);
  }
});

// Post-launch backlog Phase B — self-correction for a relationship label,
// most importantly the Phase 5 migration's arbitrary GRANDPARENT→
// Grandmother/AUNT_UNCLE→Aunt/SIBLING→Sister guesses (no gender/side was
// ever stored, so those rows need a real person to pick the right value).
// Never touches `role` — only `relationship`, a display label — so this
// can't grant a new capability by itself. The one hard boundary still
// enforced: a PATCH may never move a relationship into or out of
// "parent-shaped" (FATHER/MOTHER/PARENT), because every PARENT-role row is
// invariantly parent-shaped (spec §1.4b) and letting that drift would be a
// data-integrity bug even though it wouldn't itself escalate anything (role
// is a separate column, untouched here).
childrenRouter.patch("/:childId/family/:userId", requireChildAccess, async (req, res, next) => {
  try {
    if (!req.childAccess) {
      throw new ApiError(403, "You don't have permission to edit members on this child");
    }
    const body = req.body as Partial<UpdateMemberRelationshipRequest>;
    const newRelationship = body.relationship;
    if (!newRelationship || !ALL_RELATIONSHIP_TYPES.includes(newRelationship)) {
      throw new ApiError(400, "relationship is required and must be a recognized value");
    }

    const target = await prisma.childAccess.findUnique({
      where: { childId_userId: { childId: req.params.childId, userId: req.params.userId } },
    });
    if (!target) {
      throw new ApiError(404, "That person doesn't have access to this child");
    }

    if (isParentShapedRelationship(newRelationship) !== (target.role === "PARENT")) {
      throw new ApiError(400, "That relationship isn't valid for this member's role");
    }

    const isSelf = req.params.userId === req.session.userId;
    if (!isSelf) {
      const capability: Capability =
        target.role === "PARENT"
          ? "member:invite_or_remove_parent"
          : target.role === "GUARDIAN"
            ? "member:remove_guardian"
            : "member:remove_family_or_caregiver";
      if (!can(req.childAccess, capability)) {
        throw new ApiError(403, "You don't have permission to edit this member's relationship");
      }
    } else if (target.role === "FAMILY" && (target.relationship === "CAREGIVER") !== (newRelationship === "CAREGIVER")) {
      // The one relationship value with a real permission consequence
      // (spec 9.5's CAREGIVER_DENIED set) — a member can't unilaterally
      // shed or take on their own Caregiver restriction. Whoever already
      // has authority to manage this member (a parent, or a guardian for a
      // FAMILY-role member) still can, via the branch above.
      throw new ApiError(403, "Changing this changes your own access level — ask a parent or guardian to do it instead");
    }

    const updated = await prisma.childAccess.update({
      where: { id: target.id },
      data: { relationship: newRelationship },
    });
    res.json({ userId: updated.userId, relationship: updated.relationship });
  } catch (err) {
    next(err);
  }
});

// Remove a member from a child's record. Spec §1.4's one asymmetry lives
// here: a PARENT may remove anyone; a GUARDIAN may remove a FAMILY/Caregiver
// member but not a PARENT and not another GUARDIAN — "a guardian may manage
// the child, a guardian may not manage the child's parents." This endpoint
// didn't exist before Phase 3 — nothing previously let anyone revoke
// someone else's access at all.
childrenRouter.delete("/:childId/family/:userId", requireChildAccess, async (req, res, next) => {
  try {
    if (!req.childAccess) {
      throw new ApiError(403, "You don't have permission to remove members from this child");
    }

    const target = await prisma.childAccess.findUnique({
      where: { childId_userId: { childId: req.params.childId, userId: req.params.userId } },
    });
    if (!target) {
      throw new ApiError(404, "That person doesn't have access to this child");
    }

    const isSelf = target.userId === req.session.userId;
    if (target.role === "PARENT" || target.role === "GUARDIAN") {
      // Both parents have legal rights to the child: neither can remove the
      // other (that goes through support). A parent or guardian may leave,
      // but never as the last one (every child always has one).
      if (!isSelf) {
        throw new ApiError(403, "A parent or guardian can't be removed by another parent. Contact support.", "CANNOT_REMOVE_PARENT");
      }
      const keepers = await prisma.childAccess.count({
        where: { childId: req.params.childId, role: { in: ["PARENT", "GUARDIAN"] } },
      });
      if (keepers <= 1) {
        throw new ApiError(400, "A child must always have a parent or guardian. Invite another before leaving.", "LAST_PARENT");
      }
    } else if (!isSelf && !can(req.childAccess, "member:remove_family_or_caregiver")) {
      throw new ApiError(403, "You don't have permission to remove this member");
    }

    await prisma.childAccess.delete({ where: { id: target.id } });

    // The parent who sent the invite hears about it (D10 decided).
    if (!isSelf) {
      const [removed, invite, actor, child] = await Promise.all([
        prisma.user.findUnique({ where: { id: target.userId }, select: { email: true, firstName: true } }),
        prisma.invite.findFirst({
          where: { childId: req.params.childId, acceptedAt: { not: null } },
          orderBy: { acceptedAt: "desc" },
          select: { invitedById: true, email: true },
        }),
        prisma.user.findUnique({ where: { id: req.session.userId! }, select: { firstName: true } }),
        prisma.child.findUnique({ where: { id: req.params.childId }, select: { firstName: true } }),
      ]);
      const inviterId =
        invite && removed && invite.email?.toLowerCase() === removed.email.toLowerCase() ? invite.invitedById : null;
      if (inviterId && inviterId !== req.session.userId) {
        await notify([inviterId], {
          kind: "access.removed",
          params: { person: removed?.firstName ?? "", child: child?.firstName ?? "", actor: actor?.firstName ?? "" },
          childId: req.params.childId,
          actorId: req.session.userId!,
        });
      }
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});


