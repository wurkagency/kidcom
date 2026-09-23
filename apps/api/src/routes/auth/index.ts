import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  MeResponse,
  PublicUser,
  ResetPasswordRequest,
  SignupRequest,
  TwoFactorRequiredResponse,
  UpdateProfileRequest,
  VerifyTwoFactorRequest,
} from "@kidcom/shared";
import { isValidEmail, isSkinId } from "@kidcom/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { ApiError } from "../../middleware/errorHandler";
import { hashVerificationToken, sendVerificationEmail } from "../../lib/emailVerification";
import { hashResetToken, sendPasswordResetEmail } from "../../lib/passwordReset";
import { TWO_FACTOR_MAX_ATTEMPTS, hashTwoFactorCode, sendLoginTwoFactorCode } from "../../lib/twoFactor";
import { withRls } from "../../lib/rls";

export const authRouter = Router();

const SALT_ROUNDS = 10;
// I-2 (spec §2.2/§4.3) — the one-time per-user trial window, granted at
// account creation. Same 30-day figure invites/index.ts already used for
// the (now legacy-for-entitlement) Subscription-level trial.
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

// Basic per-IP throttling on the endpoints most attractive to abuse
// (credential stuffing on /login, signup spam, and verification-email
// flooding via /resend-verification) — nothing existed here before. Kept
// deliberately simple (no CAPTCHA/external service) since this is meant as
// a low-effort floor, not a full anti-abuse system.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please try again later." },
  // The integration test suite creates many real accounts per run (every
  // test that needs an authenticated caller signs one up — see
  // testUtils/auth.ts) from what express-rate-limit sees as a single
  // "IP" (supertest never leaves the process), which would otherwise trip
  // this within one `vitest run`. Real per-IP abuse protection stays on
  // everywhere else.
  skip: () => config.nodeEnv === "test",
});

function toPublicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  skinId: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    skinId: isSkinId(user.skinId ?? "") ? (user.skinId as PublicUser["skinId"]) : null,
  };
}

authRouter.post("/signup", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<SignupRequest>;
    const email = body.email?.trim().toLowerCase();
    const { password, firstName, lastName, phone, acceptedTerms } = body;

    if (!email || !password || !firstName || !lastName) {
      throw new ApiError(400, "email, password, firstName, and lastName are required");
    }
    if (!isValidEmail(email)) {
      throw new ApiError(400, "Please enter a valid email address");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long");
    }
    if (acceptedTerms !== true) {
      throw new ApiError(400, "You must accept the Terms & Privacy Policy to continue");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Every new account starts on the Free tier (PRD pricing section) —
    // status ACTIVE and Subscription.trialEndsAt: null, since an organic
    // Free signup's *subscription* never expires (spec §4.1's permanent
    // Free tier — contrast with invites/index.ts, where an invited user's
    // Subscription itself starts TRIALING). Separately, I-2 (spec §2.2/
    // §4.3) grants every new account — organic or invited alike — its own
    // one-time 30-day User-level trial (User.trialStartedAt/trialEndsAt),
    // which is what lets this person's own coverage temporarily reach
    // FAMILY-tier requirements (a 2nd child, extended family, etc.) before
    // anyone needs to actually pay — see packages/shared/src/entitlement.ts.
    const now = new Date();
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone: phone?.trim() || undefined,
          termsAcceptedAt: now,
          trialStartedAt: now,
          trialEndsAt: new Date(now.getTime() + THIRTY_DAYS_MS),
        },
      });
      await tx.subscription.create({
        data: { ownerId: created.id, tier: "FREE", status: "ACTIVE", trialEndsAt: null },
      });
      return created;
    });

    req.session.userId = user.id;
    // Signup itself (the transaction above) already committed — an SMTP
    // outage/misconfiguration must never roll that back or block the
    // response, or account creation silently depends on a third-party mail
    // server's uptime. Swallow-and-log here; the user lands on the
    // VerifyEmailGate either way and can hit "resend" once mail is working.
    try {
      await sendVerificationEmail(user);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to send verification email to ${user.email}:`, err);
    }
    res.status(201).json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/verify-email", async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      throw new ApiError(400, "Missing verification token");
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashVerificationToken(token) },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, "This verification link is invalid or has expired");
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationToken.delete({ where: { id: record.id } });
      return updated;
    });

    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-verification", authRateLimiter, async (req, res, next) => {
  try {
    if (!req.session.userId) {
      throw new ApiError(401, "Not signed in");
    }
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      throw new ApiError(401, "Not signed in");
    }
    if (user.emailVerifiedAt) {
      res.status(204).end();
      return;
    }
    await sendVerificationEmail(user);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Post-launch backlog Phase F — no auth required (that's the whole point: a
// locked-out user has no session and can't prove the current password,
// which change-password requires). Always 204s whether or not the email
// belongs to a real account — telling the caller "no account exists" would
// let anyone enumerate registered emails one guess at a time.
authRouter.post("/forgot-password", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<ForgotPasswordRequest>;
    const email = body.email?.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, "A valid email is required");
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await sendPasswordResetEmail(user);
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset-password", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<ResetPasswordRequest>;
    const { token, password } = body;
    if (!token || !password) {
      throw new ApiError(400, "token and password are required");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long");
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, "This reset link is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // Single-use — same reasoning as email verification's token delete.
      prisma.passwordResetToken.delete({ where: { id: record.id } }),
    ]);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Logins always require 2FA — a correct password alone never grants a
// session. On success this sends a 6-digit email OTP and parks the login as
// "pending" (session.pendingTwoFactorUserId) rather than setting
// session.userId; the client must then call POST /auth/verify-2fa to
// actually complete login. See lib/twoFactor.ts.
authRouter.post("/login", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<LoginRequest>;
    const email = body.email?.trim().toLowerCase();
    const { password } = body;

    if (!email || !password) {
      throw new ApiError(400, "email and password are required");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, "Invalid email or password");
    }

    req.session.pendingTwoFactorUserId = user.id;
    req.session.pendingRememberMe = body.rememberMe !== false;
    await sendLoginTwoFactorCode(user, req);
    res.status(202).json({ twoFactorRequired: true } satisfies TwoFactorRequiredResponse);
  } catch (err) {
    next(err);
  }
});

// Completes a login started by POST /login. Requires the pending state that
// endpoint sets (not a full session — that's the whole point) plus the
// 6-digit code just emailed. Wrong codes count against a small attempt cap
// (TWO_FACTOR_MAX_ATTEMPTS) rather than allowing unlimited guesses against
// the 6-digit space; hitting the cap or expiry both require a fresh code via
// resend-2fa (or logging in again, which re-sends one too).
authRouter.post("/verify-2fa", authRateLimiter, async (req, res, next) => {
  try {
    const pendingUserId = req.session.pendingTwoFactorUserId;
    if (!pendingUserId) {
      throw new ApiError(401, "No login is pending verification");
    }
    const { code } = req.body as Partial<VerifyTwoFactorRequest>;
    if (!code) {
      throw new ApiError(400, "code is required");
    }

    const record = await prisma.loginTwoFactorCode.findFirst({
      where: { userId: pendingUserId },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, "This code has expired — request a new one");
    }
    if (record.codeHash !== hashTwoFactorCode(code)) {
      const attempts = record.attempts + 1;
      if (attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
        await prisma.loginTwoFactorCode.delete({ where: { id: record.id } });
        throw new ApiError(400, "Too many incorrect attempts — request a new code");
      }
      await prisma.loginTwoFactorCode.update({ where: { id: record.id }, data: { attempts } });
      throw new ApiError(401, "Incorrect code");
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.loginTwoFactorCode.delete({ where: { id: record.id } });
      return tx.user.findUniqueOrThrow({ where: { id: pendingUserId } });
    });

    const rememberMe = req.session.pendingRememberMe !== false;
    delete req.session.pendingTwoFactorUserId;
    delete req.session.pendingRememberMe;
    req.session.userId = user.id;
    // Unchecked "Remember me": grant a browser-session cookie (cleared on
    // browser close) instead of the configured 30-day maxAge (see
    // middleware/session.ts) — express-session's own type declaration
    // documents setting `cookie.expires` to `false` for exactly this
    // ("to enable the cookie to remain for only the duration of the
    // user-agent"), even though its type signature only lists `Date`.
    if (!rememberMe) {
      req.session.cookie.expires = false as unknown as Date;
    }
    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-2fa", authRateLimiter, async (req, res, next) => {
  try {
    const pendingUserId = req.session.pendingTwoFactorUserId;
    if (!pendingUserId) {
      throw new ApiError(401, "No login is pending verification");
    }
    const user = await prisma.user.findUnique({ where: { id: pendingUserId } });
    if (!user) {
      throw new ApiError(401, "No login is pending verification");
    }
    await sendLoginTwoFactorCode(user, req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Lets the "Not you? Use a different account" link on the code-entry screen
// back out cleanly without a full session.destroy (there's nothing else in
// the session to clear at this point anyway).
authRouter.post("/cancel-2fa", (req, res) => {
  delete req.session.pendingTwoFactorUserId;
  res.status(204).end();
});

authRouter.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie("kidcom.sid");
    res.status(204).end();
  });
});

// Swaps the caller's avatar to a MediaAsset they already uploaded via
// POST /media/upload. The asset must belong to them (avatars aren't shared
// uploads). Clearing the old asset's avatarForUserId before/alongside
// setting the new one in the same transaction keeps the unique constraint
// from ever seeing two assets claim the same user simultaneously.
// Partial account-settings update — avatar (original purpose) plus
// firstName/lastName/email (new, for the Account Settings screen's inline
// edit card). Every field is optional; only the ones present are touched.
//
// Changing `email` is treated as a real security action, not a cosmetic
// edit: it's what requireVerifiedEmail gates on, so a successful change
// resets emailVerifiedAt to null and re-sends the real confirmation email
// (same sendVerificationEmail signup uses) — same swallow-and-log treatment
// as signup so an SMTP hiccup never blocks the save itself.
authRouter.patch("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      throw new ApiError(401, "Not signed in");
    }
    const body = req.body as Partial<UpdateProfileRequest>;
    const { avatarMediaAssetId, firstName, lastName, skinId } = body;
    const email = body.email?.trim().toLowerCase();

    if (
      avatarMediaAssetId === undefined &&
      firstName === undefined &&
      lastName === undefined &&
      email === undefined &&
      skinId === undefined
    ) {
      throw new ApiError(400, "Nothing to update");
    }
    if (firstName !== undefined && !firstName.trim()) {
      throw new ApiError(400, "firstName can't be empty");
    }
    if (lastName !== undefined && !lastName.trim()) {
      throw new ApiError(400, "lastName can't be empty");
    }
    if (email !== undefined && !isValidEmail(email)) {
      throw new ApiError(400, "Please enter a valid email address");
    }
    if (skinId !== undefined && !isSkinId(skinId)) {
      throw new ApiError(400, "Unknown skin");
    }

    let avatarAsset: { id: string; ownerId: string } | null = null;
    if (avatarMediaAssetId !== undefined) {
      avatarAsset = await withRls(req.session.userId, (tx) => tx.mediaAsset.findUnique({ where: { id: avatarMediaAssetId } }));
      if (!avatarAsset) {
        throw new ApiError(404, "Media not found");
      }
      if (avatarAsset.ownerId !== req.session.userId) {
        throw new ApiError(403, "You don't have access to this media");
      }
    }

    const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: req.session.userId } });
    const emailChanged = email !== undefined && email !== currentUser.email;
    if (emailChanged) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new ApiError(409, "An account with this email already exists");
      }
    }

    const user = await withRls(req.session.userId, async (tx) => {
      if (avatarMediaAssetId !== undefined) {
        await tx.mediaAsset.updateMany({
          where: { avatarForUserId: req.session.userId! },
          data: { avatarForUserId: null },
        });
        await tx.mediaAsset.update({
          where: { id: avatarMediaAssetId },
          data: { avatarForUserId: req.session.userId! },
        });
      }
      return tx.user.update({
        where: { id: req.session.userId! },
        data: {
          ...(avatarMediaAssetId !== undefined ? { avatarUrl: avatarMediaAssetId } : {}),
          ...(firstName !== undefined ? { firstName } : {}),
          ...(lastName !== undefined ? { lastName } : {}),
          ...(emailChanged ? { email, emailVerifiedAt: null } : {}),
          ...(skinId !== undefined ? { skinId } : {}),
        },
      });
    });

    if (emailChanged) {
      try {
        await sendVerificationEmail(user);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to send verification email to ${user.email}:`, err);
      }
    }

    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      res.json({ user: null } satisfies MeResponse);
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      res.json({ user: null } satisfies MeResponse);
      return;
    }
    res.json({ user: toPublicUser(user) } satisfies MeResponse);
  } catch (err) {
    next(err);
  }
});

// Privacy & Security screen — "Change Password". Requires the current
// password (not just an active session) before setting a new one, same
// verification bar as any real account-security flow.
authRouter.post("/change-password", authRateLimiter, async (req, res, next) => {
  try {
    if (!req.session.userId) {
      throw new ApiError(401, "Not signed in");
    }
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "currentPassword and newPassword are required");
    }
    if (newPassword.length < 8) {
      throw new ApiError(400, "New password must be at least 8 characters long");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session.userId } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, "Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Privacy & Security screen — "Export My Data". A real, scoped export (the
// caller's own profile, the children they have access to, journal posts
// they authored, their personal notes, and growth entries for children they
// can see — GrowthEntry has no per-entry author, so this is "visible to
// you", not "logged by you"), not a raw table dump.
authRouter.get("/export", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      throw new ApiError(401, "Not signed in");
    }
    const userId = req.session.userId;

    const [user, access, journalPosts, notes] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.childAccess.findMany({ where: { userId }, include: { child: true } }),
      withRls(userId, (tx) => tx.journalPost.findMany({ where: { authorId: userId }, include: { media: true } })),
      prisma.personalNote.findMany({ where: { userId } }),
    ]);
    const childIds = access.map((a) => a.childId);
    const growthEntries = childIds.length
      ? await withRls(userId, (tx) => tx.growthEntry.findMany({ where: { childId: { in: childIds } } }))
      : [];

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: toPublicUser(user),
      children: access.map((a) => ({
        childId: a.childId,
        firstName: a.child.firstName,
        lastName: a.child.lastName,
        birthday: a.child.birthday.toISOString(),
        role: a.role,
      })),
      journalPosts: journalPosts.map((p) => ({
        id: p.id,
        title: p.title,
        text: p.text,
        createdAt: p.createdAt.toISOString(),
        mediaCount: p.media.length,
      })),
      personalNotes: notes.map((n) => ({
        id: n.id,
        text: n.text,
        category: n.category,
        createdAt: n.createdAt.toISOString(),
      })),
      growthEntries: growthEntries.map((g) => ({
        id: g.id,
        childId: g.childId,
        measuredAt: g.measuredAt.toISOString(),
        heightCm: g.heightCm,
        weightKg: g.weightKg,
        note: g.note,
      })),
    };

    res.setHeader("Content-Disposition", 'attachment; filename="kidcom-data-export.json"');
    res.json(exportData);
  } catch (err) {
    next(err);
  }
});

// Privacy & Security screen — "Delete Account". Cascades via the existing
// onDelete: Cascade relations on User's child models (ChildAccess,
// JournalPost, Comment, PersonalNote, etc.) — no per-model cleanup code
// needed. Does not delete a Child itself (co-parents may still need it);
// only this user's access/content is removed.
authRouter.delete("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      throw new ApiError(401, "Not signed in");
    }
    const userId = req.session.userId;
    await prisma.user.delete({ where: { id: userId } });
    req.session.destroy(() => {
      res.clearCookie("kidcom.sid");
      res.status(204).end();
    });
  } catch (err) {
    next(err);
  }
});
