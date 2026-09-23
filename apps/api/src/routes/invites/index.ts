import { Router } from "express";
import bcrypt from "bcryptjs";
import type { AcceptInviteRequest, CreateInviteRequest, CreateInviteResponse, InvitePreviewResponse, MeResponse } from "@kidcom/shared";
import { ALL_RELATIONSHIP_TYPES, relationshipTypeToRole, isValidEmail } from "@kidcom/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth, requireVerifiedEmail } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { can, type Capability } from "../../lib/permissions";
import { mailSender } from "../../lib/mailSender";
import { sendVerificationEmail } from "../../lib/emailVerification";
import { logAccessGrant } from "../../lib/accessGrantAnalytics";
import { findClaimableChild, mergeChildAccessInto } from "../../lib/claimMerge";
import { assertUnderMemberFairUseCap } from "../../lib/fairUseCaps";
import { bypassRls } from "../../lib/rls";
import { toPublicUser } from "../../lib/publicUser";

export const invitesRouter = Router();

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const SALT_ROUNDS = 10;

// POST /invites — creates the invite record and sends the accept link
// through MailSender (chunk 7 — see lib/mailSender.ts). No real provider is
// wired up yet (still logs to the console, just through the swappable
// interface). Email-only: phone/SMS invites were removed from this pass —
// they never worked end to end (the accept endpoint always rejected them,
// and OnboardingInvitePage's success message was misleading), and real SMS
// delivery is still a deferred, un-scoped feature rather than something to
// half-build here.
invitesRouter.post("/", requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    const body = req.body as Partial<CreateInviteRequest>;
    const { childId, relationship } = body;

    if (!childId || !relationship) {
      throw new ApiError(400, "childId and relationship are required");
    }
    if (!ALL_RELATIONSHIP_TYPES.includes(relationship)) {
      throw new ApiError(400, "relationship is not a recognized value");
    }
    // spec 9.16 — a sibling isn't invited by email; a parent adds their
    // account directly (POST /children/:childId/family/minor). Blocking it
    // here is the actual enforcement — OnboardingInvitePage.tsx already
    // omits BROTHER/SISTER from its picker, but that's UI-only and this
    // route is reachable directly.
    if (relationship === "BROTHER" || relationship === "SISTER") {
      throw new ApiError(400, "A sibling's account is added directly by a parent, not invited by email");
    }
    if (!body.email) {
      throw new ApiError(400, "email is required");
    }
    if (!isValidEmail(body.email)) {
      throw new ApiError(400, "Please enter a valid email address");
    }

    const access = await prisma.childAccess.findUnique({
      where: { childId_userId: { childId, userId: req.session.userId! } },
    });
    if (!access) {
      throw new ApiError(403, "You don't have access to this child");
    }

    // The client never sends an AccessRole directly — the server derives it
    // from relationship so permissions can't be spoofed by tampering with
    // the request body (e.g. claiming FATHER-level access while labeling
    // someone "Caregiver"). This is the *invitee-onto-an-existing-child*
    // mapping — deliberately never used for a creator's own bootstrap grant
    // (spec §1.4b, Phase 9).
    const role = relationshipTypeToRole(relationship);

    // D1 (spec 9.6a) + Phase 4 (spec §1.4's Guardian column): inviting a
    // PARENT is PARENT-only; inviting a FAMILY/Caregiver member is PARENT
    // or GUARDIAN. Previously any ChildAccess row at all (including a
    // Caregiver) passed this check, which let any family member install a
    // new co-parent by inviting them as CO_PARENT.
    const inviteCapability: Capability = role === "PARENT" ? "member:invite_or_remove_parent" : "member:invite_family_or_caregiver";
    if (!can(access, inviteCapability)) {
      throw new ApiError(
        403,
        role === "PARENT" ? "Only a parent can invite another parent" : "Only a parent or guardian can invite someone to this child"
      );
    }

    // spec 9.10 — fair-use soft cap, checked here so a child already at the
    // member limit doesn't even get a pending invite created for it (still
    // re-checked at actual accept time below, since membership can change
    // in between).
    await assertUnderMemberFairUseCap(childId);

    // NOTE: spec §4.1 also lists "no invites" as part of the finalized Free
    // tier — deliberately NOT enforced here. Blocking it now, before Phase
    // 7's per-child entitlement engine exists, would break the existing
    // first-invite-is-free onboarding flow (a brand-new Free-tier organic
    // signup inviting their co-parent right after creating their first
    // child) with no paywall UX in place to explain why. Spec §2.2a's T2
    // trigger ("adding a second adult raises requiredTier to Parents") is
    // the real mechanism this restriction depends on — that's Phase 7, not
    // this defect fix.

    const invite = await prisma.invite.create({
      data: {
        childId,
        role,
        relationship,
        email: body.email,
        invitedById: req.session.userId!,
        trialEndsAt: new Date(Date.now() + THIRTY_DAYS_MS),
      },
    });

    const acceptUrl = `${config.corsOrigin[0]}/invite/${invite.token}`;
    await mailSender.send({
      to: body.email,
      subject: "You've been invited to KidCom",
      text: `You've been invited to join KidCom. Accept here: ${acceptUrl}\n\nThis link starts a 30-day free trial.`,
    });

    res.status(201).json({ id: invite.id, token: invite.token } satisfies CreateInviteResponse);
  } catch (err) {
    next(err);
  }
});

// GET /invites/:token — lets the accept page know what it's dealing with
// (invalid/expired/already-accepted token, or an account already existing
// for the invited email) before rendering any form. No auth required — the
// token itself is the credential to even look this up, same as accept.
invitesRouter.get("/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { child: true, invitedBy: true },
    });

    if (!invite) {
      res.json({
        valid: false,
        reason: "not_found",
        email: null,
        childName: null,
        inviterName: null,
        userExists: false,
        relationship: null,
      } satisfies InvitePreviewResponse);
      return;
    }
    if (invite.acceptedAt) {
      res.json({
        valid: false,
        reason: "already_accepted",
        email: invite.email,
        childName: invite.child?.firstName ?? null,
        inviterName: `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`.trim(),
        userExists: false,
        relationship: invite.relationship,
      } satisfies InvitePreviewResponse);
      return;
    }

    const existing = invite.email
      ? await prisma.user.findUnique({ where: { email: invite.email } })
      : null;

    res.json({
      valid: true,
      email: invite.email,
      childName: invite.child?.firstName ?? null,
      inviterName: `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`.trim(),
      userExists: existing !== null,
      relationship: invite.relationship,
    } satisfies InvitePreviewResponse);
  } catch (err) {
    next(err);
  }
});

// POST /invites/:token/accept — creates a BRAND NEW account for the invited
// email (no session required — the token is the credential) and grants it
// ChildAccess per the invite's role/child. Only for emails with no existing
// account; see /accept-as-me below for the "I already have an account"
// case. This used to silently log the caller into an *existing* account
// with no password check at all if one existed for invite.email — a full
// account-takeover hole, since anyone holding the link could submit any
// password/name and be authenticated as that person. Fixed by checking for
// an existing account up front and rejecting instead.
invitesRouter.post("/:token/accept", async (req, res, next) => {
  try {
    const { token } = req.params;
    const body = req.body as Partial<AcceptInviteRequest>;
    const { firstName, lastName, password } = body;

    if (!firstName || !lastName || !password) {
      throw new ApiError(400, "firstName, lastName, and password are required");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long");
    }

    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) {
      throw new ApiError(404, "Invite not found");
    }
    if (invite.acceptedAt) {
      throw new ApiError(409, "This invite has already been accepted");
    }
    // spec §2.2b point 3 — a shareable claim-link has no email on file
    // (created for whoever the bootstrap creator couldn't reach by email
    // directly); the acceptor supplies their own email right here instead
    // of it being fixed in advance.
    const accountEmail = invite.email ?? body.email?.trim().toLowerCase();
    if (!accountEmail) {
      throw new ApiError(400, "email is required to accept this link");
    }
    if (!isValidEmail(accountEmail)) {
      throw new ApiError(400, "Please enter a valid email address");
    }
    // relationship is nullable at the DB level (mirrors the old
    // familyMemberType column) but POST /invites always sets it — this
    // should be unreachable in practice, guarded rather than asserted since
    // ChildAccess.relationship is NOT NULL.
    if (invite.childId && !invite.relationship) {
      throw new ApiError(500, "This invite is missing a relationship");
    }

    const existing = await prisma.user.findUnique({ where: { email: accountEmail } });
    if (existing) {
      throw new ApiError(
        409,
        "An account already exists for this email — log in to accept this invite."
      );
    }

    // spec 9.10 — re-checked here (not just at invite-creation time above)
    // since membership can have grown in the meantime.
    if (invite.childId) {
      await assertUnderMemberFairUseCap(invite.childId);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date();

    const user = await prisma.$transaction(async (tx) => {
      // I-2 (spec §2.2/§4.3): the User-level trial that actually matters
      // for entitlement, same as an organic signup gets — see
      // routes/auth/index.ts's comment for why this lives separately from
      // the Subscription.status TRIALING below.
      const account = await tx.user.create({
        data: {
          email: accountEmail,
          passwordHash,
          firstName,
          lastName,
          trialStartedAt: now,
          trialEndsAt: new Date(now.getTime() + THIRTY_DAYS_MS),
        },
      });
      // Invited users' own Subscription also starts in a 30-day TRIALING
      // window (PRD pricing section) — this is display/billing-history only
      // as of Phase 7 (see Subscription.trialEndsAt's schema comment); it no
      // longer gates anything by itself.
      await tx.subscription.create({
        data: {
          ownerId: account.id,
          tier: "FREE",
          status: "TRIALING",
          trialEndsAt: new Date(now.getTime() + THIRTY_DAYS_MS),
        },
      });

      if (invite.childId) {
        await tx.childAccess.create({
          data: {
            childId: invite.childId,
            userId: account.id,
            role: invite.role,
            relationship: invite.relationship!,
          },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return account;
    });

    // Phase 6a (spec 9.20) — best-effort, outside the transaction above so
    // an analytics hiccup never risks rolling back a real account creation.
    if (invite.childId) {
      const inviterAccess = await prisma.childAccess.findUnique({
        where: { childId_userId: { childId: invite.childId, userId: invite.invitedById } },
      });
      await logAccessGrant({
        relationship: invite.relationship!,
        inviterRelationship: inviterAccess?.relationship ?? null,
        timeToAcceptMs: Date.now() - invite.createdAt.getTime(),
      });
    }

    req.session.userId = user.id;
    // Same anti-spoofing treatment as an organic signup (apps/api/src/routes/
    // auth/index.ts) — this route also creates a brand-new account, just via
    // an invite link rather than the signup form, so it needs the same
    // "prove you control this inbox" verification email before the account
    // can do anything sensitive (the frontend's verify-email gate covers
    // both paths identically). Account creation above already committed —
    // an SMTP failure must not block the response; swallow-and-log, same as
    // the organic signup path.
    try {
      await sendVerificationEmail(user);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to send verification email to ${user.email}:`, err);
    }
    res.json({
      user: toPublicUser({ ...user, emailVerifiedAt: null }),
    } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

// POST /invites/:token/accept-as-me — for a caller who's already logged in
// (and, per the preview endpoint above, already has an account matching the
// invite's email): just grants ChildAccess to the current session's user.
// No password needed — they're already authenticated as themselves. Only
// accepts if the invite's email matches the current user's email, so this
// can't be used to grab access meant for someone else.
invitesRouter.post(
  "/:token/accept-as-me",
  requireAuth,
  requireVerifiedEmail,
  async (req, res, next) => {
  try {
    const { token } = req.params;
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) {
      throw new ApiError(404, "Invite not found");
    }
    if (invite.acceptedAt) {
      throw new ApiError(409, "This invite has already been accepted");
    }
    // spec §2.2b point 3 — a claim-link (no email on file) has no fixed
    // target; whoever holds it and is logged in may accept it. A normal
    // invite still only accepts the exact person it was sent to.
    if (invite.email) {
      const me0 = await prisma.user.findUnique({ where: { id: req.session.userId! } });
      if (!me0 || me0.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ApiError(403, "This invite was sent to a different email address.");
      }
    }
    if (invite.childId && !invite.relationship) {
      throw new ApiError(500, "This invite is missing a relationship");
    }

    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.session.userId! } });

    // spec 9.9 — claim/merge: does `me` already have a real (PARENT-role)
    // child matching this invite's target by name + birthday? If so, this
    // invite/claim-link is for a duplicate record of a child they already
    // have — merge instead of creating a second one.
    const claimTargetChildId = invite.childId ? await findClaimableChild(me.id, invite.childId) : null;
    const finalChildId = claimTargetChildId ?? invite.childId;

    let grantedNewAccess = false;
    await prisma.$transaction(async (tx) => {
      if (invite.childId && claimTargetChildId) {
        // Repoint the invite before deleting the duplicate it used to
        // reference, then move every *other* member's access onto the real
        // child — `me` already holds PARENT access there, nothing to grant.
        await tx.invite.update({ where: { id: invite.id }, data: { childId: claimTargetChildId, acceptedAt: new Date() } });
        // Reassigns OTHER members' moments/medical/etc. content between two
        // child records — already verified legitimate by findClaimableChild
        // above (me's own real PARENT-access child, matched by name +
        // birthday), not something `me`'s own ChildAccess grants would
        // authorize on their own. See lib/rls.ts's bypassRls().
        await bypassRls(tx);
        await mergeChildAccessInto(tx, invite.childId, claimTargetChildId, me.id);
      } else if (invite.childId) {
        const existingAccess = await tx.childAccess.findUnique({
          where: { childId_userId: { childId: invite.childId, userId: me.id } },
        });
        grantedNewAccess = !existingAccess;
        if (grantedNewAccess) {
          // spec 9.10 — re-checked here (not just at invite-creation time),
          // since membership can have grown in the meantime. Deliberately
          // not applied to the claim/merge branch above — that's a one-time
          // reconciliation of an existing duplicate, not new organic growth.
          await assertUnderMemberFairUseCap(invite.childId);
        }
        await tx.childAccess.upsert({
          where: { childId_userId: { childId: invite.childId, userId: me.id } },
          update: {},
          create: {
            childId: invite.childId,
            userId: me.id,
            role: invite.role,
            relationship: invite.relationship!,
          },
        });
        await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      } else {
        await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      }
    });

    // Phase 6a (spec 9.20) — only for an actual new grant, not the no-op
    // upsert branch (already had access to this child some other way) and
    // not a claim/merge (me already had their own access; the event this
    // invite represents already logged at creation-time, if bootstrapped).
    if (finalChildId && grantedNewAccess) {
      const inviterAccess = await prisma.childAccess.findUnique({
        where: { childId_userId: { childId: finalChildId, userId: invite.invitedById } },
      });
      await logAccessGrant({
        relationship: invite.relationship!,
        inviterRelationship: inviterAccess?.relationship ?? null,
        timeToAcceptMs: Date.now() - invite.createdAt.getTime(),
      });
    }

    res.json({
      user: toPublicUser(me),
    } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
  }
);
