import { Router } from "express";
import bcrypt from "bcryptjs";
import type {
  AcceptInviteRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  FamilyMemberType,
  InvitePreviewResponse,
  MeResponse,
  ParentRole,
} from "@kidcom/shared";
import { familyMemberTypeToRole, isValidEmail } from "@kidcom/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth, requireVerifiedEmail } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { mailSender } from "../../lib/mailSender";
import { sendVerificationEmail } from "../../lib/emailVerification";

export const invitesRouter = Router();

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const SALT_ROUNDS = 10;

const PARENT_ROLES: ParentRole[] = ["FATHER", "MOTHER", "PARENT"];

const FAMILY_MEMBER_TYPES: FamilyMemberType[] = [
  "CO_PARENT",
  "GRANDPARENT",
  "AUNT_UNCLE",
  "SIBLING",
  "CAREGIVER",
  "OTHER",
];

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
    const { childId, familyMemberType } = body;

    if (!childId || !familyMemberType) {
      throw new ApiError(400, "childId and familyMemberType are required");
    }
    if (!FAMILY_MEMBER_TYPES.includes(familyMemberType)) {
      throw new ApiError(400, "familyMemberType is not a recognized value");
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
    // from familyMemberType so permissions can't be spoofed by tampering
    // with the request body (e.g. claiming CO_PARENT-level access while
    // labeling someone "Caregiver").
    const role = familyMemberTypeToRole(familyMemberType);

    const invite = await prisma.invite.create({
      data: {
        childId,
        role,
        familyMemberType,
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
        familyMemberType: null,
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
        familyMemberType: invite.familyMemberType,
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
      familyMemberType: invite.familyMemberType,
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
    const { firstName, lastName, password, parentRole } = body;

    if (!firstName || !lastName || !password || !parentRole) {
      throw new ApiError(400, "firstName, lastName, password, and parentRole are required");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long");
    }
    if (!PARENT_ROLES.includes(parentRole)) {
      throw new ApiError(400, "parentRole must be one of FATHER, MOTHER, PARENT");
    }

    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) {
      throw new ApiError(404, "Invite not found");
    }
    if (invite.acceptedAt) {
      throw new ApiError(409, "This invite has already been accepted");
    }
    if (!invite.email) {
      throw new ApiError(400, "This invite has no email on file");
    }

    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      throw new ApiError(
        409,
        "An account already exists for this email — log in to accept this invite."
      );
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: { email: invite.email!, passwordHash, firstName, lastName, parentRole },
      });
      // Invited users get a 30-day trial (PRD pricing section) before
      // requireActiveAccess starts blocking mutations — see chunk 7 plan
      // notes. Organic signups (apps/api/src/routes/auth/index.ts) get
      // trialEndsAt: null instead, so they never expire.
      await tx.subscription.create({
        data: {
          ownerId: account.id,
          tier: "FREE",
          status: "TRIALING",
          trialEndsAt: new Date(Date.now() + THIRTY_DAYS_MS),
        },
      });

      if (invite.childId) {
        await tx.childAccess.create({
          data: {
            childId: invite.childId,
            userId: account.id,
            role: invite.role,
            familyMemberType: invite.familyMemberType,
          },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return account;
    });

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
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        parentRole: user.parentRole,
        emailVerifiedAt: null,
      },
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
    if (!invite.email) {
      throw new ApiError(400, "This invite has no email on file");
    }

    const me = await prisma.user.findUnique({ where: { id: req.session.userId! } });
    if (!me || me.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ApiError(403, "This invite was sent to a different email address.");
    }

    await prisma.$transaction(async (tx) => {
      if (invite.childId) {
        await tx.childAccess.upsert({
          where: { childId_userId: { childId: invite.childId, userId: me.id } },
          update: {},
          create: {
            childId: invite.childId,
            userId: me.id,
            role: invite.role,
            familyMemberType: invite.familyMemberType,
          },
        });
      }
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    });

    res.json({
      user: {
        id: me.id,
        email: me.email,
        firstName: me.firstName,
        lastName: me.lastName,
        avatarUrl: me.avatarUrl,
        parentRole: me.parentRole,
        emailVerifiedAt: me.emailVerifiedAt ? me.emailVerifiedAt.toISOString() : null,
      },
    } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
  }
);
