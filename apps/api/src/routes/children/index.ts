import { Router } from "express";
import type {
  AccessRole,
  ChildCoverageStatus,
  ChildDetail,
  ChildGender,
  ChildSummary,
  CreateChildRequest,
  CreateChildResponse,
  CreateMinorMemberRequest,
  CreateUpgradeRequestResponse,
  MinorMemberDto,
  RelationshipType,
  UpdateChildRequest,
  UpdateMemberRelationshipRequest,
  UpgradeRequestDto,
} from "@kidcom/shared";
import { ALL_RELATIONSHIP_TYPES, isParentShapedRelationship, isValidEmail, requiredTier } from "@kidcom/shared";

const CHILD_GENDERS: ChildGender[] = ["BOY", "GIRL", "OTHER"];
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth, requireVerifiedEmail } from "../../middleware/session";
import { requireChildAccess } from "../../middleware/childAccess";
import { effectiveTier } from "../../middleware/billing";
import { ApiError } from "../../middleware/errorHandler";
import { childCapForTier } from "../../lib/billingPricing";
import { can, requireCapability, type Capability } from "../../lib/permissions";
import { logAccessGrant } from "../../lib/accessGrantAnalytics";
import { requireChildEntitlement, isChildSatisfied, childInGraceWindow, childSatisfyingParentIds } from "../../lib/entitlement";
import { assertUnderChildFairUseCap, assertUnderMemberFairUseCap } from "../../lib/fairUseCaps";
import { pushQueue } from "../../lib/pushQueue";
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

export const childrenRouter = Router();

childrenRouter.use(requireAuth);

// D3 (spec §4.1, Phase 2) removed the old blanket per-user trial-expiry
// gate that used to sit here — see that phase's history for why. Phase 7
// replaces it with the real thing: requireChildEntitlement, mounted per
// sub-router below, right after requireChildAccess. This is spec §2.2a's
// T1/T2/T3 paywall made real — a child whose circle has outgrown what
// anyone covering it is paying for gets its mutations blocked here,
// regardless of which specific capability the caller would otherwise have.
//
// Sub-routers mounted below all use `mergeParams: true` so they see the
// `:childId` param from these mount paths.
childrenRouter.use("/:childId/medical-info", requireChildAccess, requireChildEntitlement, medicalInfoRouter);
childrenRouter.use("/:childId/growth-entries", requireChildAccess, requireChildEntitlement, growthEntriesRouter);
childrenRouter.use("/:childId/emergency-contacts", requireChildAccess, requireChildEntitlement, emergencyContactsRouter);
childrenRouter.use("/:childId/schedule", requireChildAccess, requireChildEntitlement, scheduleRouter);
// No requireChildEntitlement here — spec §4.2's safety floor means custody
// plan writes for a PARENT-role member must never be blocked by billing
// status at all. custodyPlanRouter's own PUT handler does a PARENT-aware
// entitlement check inline instead (GUARDIAN still gated normally).
childrenRouter.use("/:childId/custody-plan", requireChildAccess, custodyPlanRouter);
childrenRouter.use("/:childId/calendar", requireChildAccess, requireChildEntitlement, calendarRouter);
childrenRouter.use("/:childId/calendar-events", requireChildAccess, requireChildEntitlement, calendarEventsRouter);
childrenRouter.use("/:childId/calendar-event-requests", requireChildAccess, requireChildEntitlement, calendarEventRequestsRouter);
childrenRouter.use("/:childId/swap-requests", requireChildAccess, requireChildEntitlement, swapRequestsRouter);
childrenRouter.use("/:childId/moments", requireChildAccess, requireChildEntitlement, momentsRouter);
childrenRouter.use("/:childId/lists", requireChildAccess, requireChildEntitlement, listItemsRouter);
childrenRouter.use("/:childId/tasks", requireChildAccess, requireChildEntitlement, tasksRouter);
childrenRouter.use("/:childId/notes", requireChildAccess, requireChildEntitlement, childNotesRouter);
childrenRouter.use("/:childId/school-lessons", requireChildAccess, requireChildEntitlement, schoolLessonsRouter);
childrenRouter.use("/:childId/handover-packing", requireChildAccess, requireChildEntitlement, handoverPackingRouter);
// Phase 10 (spec 9.21) — no requireChildEntitlement, see deletion.ts's own
// comment for why.
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
    res.json({ children: children.map((c) => toChildSummary(c, c.access[0]!)) });
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

    // Free caps at 1 child; Parents and Family are both unlimited — counted
    // as however many children this user currently has PARENT-role
    // ChildAccess to, however they got it (D6: this only ever counts
    // genuine parents now that a non-parent creator gets GUARDIAN, not
    // PARENT — see the proof test for this). Trial accounts (status
    // TRIALING, trial not yet expired) get the same unlimited cap while
    // trialing even though their nominal tier is FREE — a trialing account
    // gets full feature access so they can properly evaluate the paid
    // tiers, per the product decision this follows; requireChildEntitlement
    // (mounted on every sub-resource) still gates once the trial expires.
    const [subscription, existingCount] = await Promise.all([
      prisma.subscription.upsert({
        where: { ownerId: req.session.userId! },
        update: {},
        create: { ownerId: req.session.userId! },
      }),
      prisma.childAccess.count({ where: { userId: req.session.userId!, role: "PARENT" } }),
    ]);
    const tier = effectiveTier(subscription);
    const isTrialing =
      subscription.status === "TRIALING" &&
      (!subscription.trialEndsAt || subscription.trialEndsAt.getTime() > Date.now());
    const cap = isTrialing ? Infinity : childCapForTier(tier);
    // Deliberately not applied to a bootstrap grant: this cap answers "how
    // many children do you PARENT," which a GUARDIAN grant never claims to
    // be. Bootstrap creation is bounded by different, already-existing
    // mechanisms instead (spec §2.2b): her own one-time trial while it
    // lasts, then the §4.2 safety floor's deliberate GUARDIAN exclusion
    // once it doesn't, and the 9.10 soft fair-use cap (Phase 10) for the
    // mass-creation pattern specifically.
    if (!isBootstrapGuardian && existingCount >= cap) {
      throw new ApiError(403, "Your current plan is limited to 1 child — upgrade to Parents or Family for unlimited children");
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
            subject: `${firstName} needs you on KidCom`,
            text: `You've been listed as ${firstName}'s parent on KidCom. Accept here to see ${firstName}'s schedule and memories: ${acceptUrl}\n\nThis link starts a 30-day free trial.`,
          });
          emailSent = true;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Failed to send bootstrap parent-contact invite to ${parentContact.email}:`, err);
        }
      }
      parentInvite = { token: invite.token, emailSent };
    }

    res.status(201).json({ ...toChildSummary(child, { role, relationship }), parentInvite } satisfies CreateChildResponse);
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
      ...toChildSummary(child, req.childAccess!),
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
  requireChildEntitlement,
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
      ...toChildSummary(child, req.childAccess!),
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
        avatarUrl: a.user.avatarUrl,
        role: a.role,
        relationship: a.relationship,
        isMinorMember: a.isMinorMember,
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
          email: `minor-${randomBytes(12).toString("hex")}@kidcom.invalid`,
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

    const capability: Capability =
      target.role === "PARENT"
        ? "member:invite_or_remove_parent"
        : target.role === "GUARDIAN"
          ? "member:remove_guardian"
          : "member:remove_family_or_caregiver";
    if (!can(req.childAccess, capability)) {
      throw new ApiError(403, "You don't have permission to remove this member");
    }

    if (target.role === "PARENT") {
      // I-3 (spec §2.2): a child always has at least one coverage-eligible
      // member. Refuse to remove the last PARENT — a parent may still
      // target their own row (a "leave this child" action) as long as a
      // co-parent remains; nothing in spec §1.4 forbids that.
      const parentCount = await prisma.childAccess.count({
        where: { childId: req.params.childId, role: "PARENT" },
      });
      if (parentCount <= 1) {
        throw new ApiError(400, "A child must always have at least one parent — invite another parent before removing this one");
      }
    }

    await prisma.childAccess.delete({ where: { id: target.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Phase 8 (spec §4.2 pt.4) — the data behind a "take over this subscription"
// prompt: is this child only satisfied because someone's grace window
// hasn't run out yet, and who's already covering it (so the frontend knows
// who NOT to nag).
childrenRouter.get("/:childId/coverage", requireChildAccess, async (req, res, next) => {
  try {
    const childId = req.params.childId;
    const access = await prisma.childAccess.findMany({ where: { childId }, select: { userId: true, role: true } });
    const members = access.map((a) => ({ userId: a.userId, role: a.role }));

    const [satisfied, inGraceWindow, satisfyingParentIds] = await Promise.all([
      isChildSatisfied(childId),
      childInGraceWindow(childId),
      childSatisfyingParentIds(childId),
    ]);

    res.json({
      satisfied,
      requiredTier: requiredTier(members, req.session.userId!),
      inGraceWindow,
      satisfyingParentIds,
    } satisfies ChildCoverageStatus);
  } catch (err) {
    next(err);
  }
});

// spec §2.3 — "ask [a co-parent] to upgrade" instead of paying yourself.
// PARENT-role only, matching who spec's worked example shows sending this
// ("Ask Charlie to upgrade"). This never moves money — the recipient still
// subscribes themselves via the existing POST /billing/subscribe; this is
// purely the notification/ask.
childrenRouter.post("/:childId/upgrade-requests", requireChildAccess, async (req, res, next) => {
  try {
    if (req.childAccess?.role !== "PARENT") {
      throw new ApiError(403, "Only a parent can ask someone to upgrade");
    }
    const childId = req.params.childId;
    const access = await prisma.childAccess.findMany({ where: { childId }, select: { userId: true, role: true } });
    const members = access.map((a) => ({ userId: a.userId, role: a.role }));
    const tierNeeded = requiredTier(members, req.session.userId!);

    const [requester, request] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: req.session.userId! } }),
      prisma.upgradeRequest.create({
        data: { childId, requestedById: req.session.userId!, requiredTier: tierNeeded },
      }),
    ]);

    const otherParents = access.filter((a) => a.role === "PARENT" && a.userId !== req.session.userId);
    await Promise.all(
      otherParents.map((p) =>
        pushQueue.add("send-push", {
          userId: p.userId,
          title: "Upgrade requested",
          body: `${requester.firstName} is asking you to upgrade this child's plan to ${tierNeeded}.`,
          url: "/billing",
        })
      )
    );

    res.status(201).json({
      id: request.id,
      requestedById: request.requestedById,
      requestedByName: `${requester.firstName} ${requester.lastName}`.trim(),
      requiredTier: request.requiredTier,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    } satisfies CreateUpgradeRequestResponse);
  } catch (err) {
    next(err);
  }
});

childrenRouter.get("/:childId/upgrade-requests", requireChildAccess, async (req, res, next) => {
  try {
    const requests = await prisma.upgradeRequest.findMany({
      where: { childId: req.params.childId, status: "PENDING" },
      include: { requestedBy: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: requests.map(
        (r): UpgradeRequestDto => ({
          id: r.id,
          requestedById: r.requestedById,
          requestedByName: `${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim(),
          requiredTier: r.requiredTier,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })
      ),
    });
  } catch (err) {
    next(err);
  }
});
