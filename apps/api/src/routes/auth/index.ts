import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  MeResponse,
  ResetPasswordRequest,
  SendPhoneCodeRequest,
  SetPasswordRequest,
  SignupRequest,
  TwoFactorRequiredResponse,
  UpdateProfileRequest,
  VerifyPhoneRequest,
  VerifyTwoFactorRequest,
} from "@kinnd/shared";
import { isLocale, isRegion, isThemeId, isValidEmail } from "@kinnd/shared";
import { deleteAccount } from "../../lib/accountDeletion";

import { prisma } from "../../db";
import { config } from "../../config";
import { ApiError } from "../../middleware/errorHandler";
import { hashVerificationToken, sendVerificationEmail } from "../../lib/emailVerification";
import { hashResetToken, sendPasswordResetEmail } from "../../lib/passwordReset";
import { TWO_FACTOR_MAX_ATTEMPTS, hashTwoFactorCode, sendLoginTwoFactorCode } from "../../lib/twoFactor";
import { withRls, withRlsBypass } from "../../lib/rls";
import { loadPublicUser } from "../../lib/publicUser";
import { createAccount } from "../../lib/accounts";
import { SALT_ROUNDS, assertStrongPassword, setPassword } from "../../lib/passwordPolicy";
import { assertPhoneAllowed, assertSmsQuota, consumePhoneCode, pendingPhone, sendPhoneCode } from "../../lib/phoneVerification";
import { recordLogin } from "../../lib/loginEvents";
import { countOtherSessions, establishSession, forgetSession, revokeOtherSessions } from "../../lib/sessions";
import { oauthRouter } from "./oauth";

export const authRouter = Router();

// Per-IP throttling on the endpoints most attractive to abuse (credential
// stuffing, signup spam, code guessing, SMS/email flooding) — one bucket per
// endpoint, so a household or a mobile carrier sharing one IP doesn't lock
// itself out by signing up and verifying. Per-account limits sit on top
// (login below; SMS in lib/phoneVerification.ts). Skipped under test:
// supertest traffic all comes from one "IP".
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `${req.ip}|${req.baseUrl}${req.path}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please try again later.", code: "TOO_MANY_ATTEMPTS" },
  skip: () => config.nodeEnv === "test",
});

// Per-account: failed password attempts on one email (existing or not — the
// answer is the same either way, so it reveals nothing) within a window. Stops
// a distributed attack from many IPs on one parent's account.
export const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

async function assertLoginAllowed(email: string): Promise<void> {
  const failures = await withRlsBypass((tx) =>
    tx.loginEvent.count({
      where: { email, method: "PASSWORD", outcome: "FAILED", createdAt: { gte: new Date(Date.now() - LOGIN_FAILURE_WINDOW_MS) } },
    })
  );
  if (failures >= LOGIN_FAILURE_LIMIT) {
    throw new ApiError(429, "Too many attempts for this account — please try again in 15 minutes", "TOO_MANY_ATTEMPTS");
  }
}

async function meResponse(userId: string): Promise<MeResponse> {
  return { user: await loadPublicUser(userId) };
}

function requireSession(userId: string | undefined): string {
  if (!userId) throw new ApiError(401, "Not signed in");
  return userId;
}

// Emails must never block or roll back the action that triggered them.
async function sendVerificationEmailSafely(user: { id: string; email: string; firstName: string }) {
  try {
    await sendVerificationEmail(user);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to send verification email for user ${user.id}:`, err);
  }
}

authRouter.use("/oauth", oauthRouter);

// ---------------------------------------------------------------------------
// Signup — name, email, mobile, consent (kinnd_sign_up). The account is
// created and signed in immediately; it then has to verify the phone by SMS
// (mandatory — every non-/auth endpoint answers 403 until it does), set a
// password, and verify the email.
// ---------------------------------------------------------------------------
authRouter.post("/signup", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<SignupRequest>;
    const email = body.email?.trim().toLowerCase();
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim() ?? "";
    const phone = body.phone?.trim();

    if (!email || !firstName) {
      throw new ApiError(400, "Name and email are required");
    }
    if (!isValidEmail(email)) {
      throw new ApiError(400, "Please enter a valid email address");
    }
    // Format, country and SMS caps (toll-fraud guard) before any account
    // exists — a sign-up that can't be texted isn't created at all.
    assertPhoneAllowed(phone);
    await assertSmsQuota(phone);
    if (body.acceptedTerms !== true) {
      throw new ApiError(400, "You must accept the Privacy Policy and Terms to continue");
    }
    if (body.password !== undefined) {
      assertStrongPassword(body.password);
    }

    if (await prisma.user.findUnique({ where: { email } })) {
      throw new ApiError(409, "An account with this email already exists", "EMAIL_TAKEN");
    }

    const user = await createAccount({
      email,
      firstName,
      lastName,
      passwordHash: body.password ? await bcrypt.hash(body.password, SALT_ROUNDS) : null,
    });

    await establishSession(req, user.id, { method: "SIGNUP" });
    await sendVerificationEmailSafely(user);
    try {
      await sendPhoneCode(user.id, phone, "VERIFY_PHONE");
    } catch (err) {
      // The account exists now: a failed text mustn't turn the sign-up into
      // an error (retrying would only say the email is taken). The phone
      // screen comes next, and its "resend" shows the error if it persists.
      if (!(err instanceof ApiError && err.code === "SMS_SEND_FAILED")) throw err;
    }
    res.status(201).json(await meResponse(user.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Phone verification (mandatory). Also how a verified user changes number:
// the new number only replaces the old one once its code is confirmed.
// ---------------------------------------------------------------------------
authRouter.post("/phone/send", authRateLimiter, async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const { phone: requested } = req.body as SendPhoneCodeRequest;
    let phone: string | null;
    if (requested !== undefined) {
      assertPhoneAllowed(requested);
      phone = requested;
    } else {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
      phone = (await pendingPhone(userId)) ?? user.phone;
    }
    if (!phone) throw new ApiError(400, "Please enter your mobile number");
    await sendPhoneCode(userId, phone, "VERIFY_PHONE");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/phone/verify", authRateLimiter, async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const { code } = req.body as Partial<VerifyPhoneRequest>;
    if (!code) throw new ApiError(400, "code is required");
    const phone = await consumePhoneCode(userId, "VERIFY_PHONE", code);
    const taken = await prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } } });
    if (taken) {
      throw new ApiError(409, "This mobile number is already used by another Kinnd account", "PHONE_TAKEN");
    }
    await prisma.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: new Date() } });
    req.session.phoneVerified = true;
    res.json(await meResponse(userId));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

// First password for an account that has none (signup step 3, or a
// Google/Microsoft account adding one).
authRouter.post("/password", authRateLimiter, async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const { password } = req.body as Partial<SetPasswordRequest>;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (user.passwordHash) {
      throw new ApiError(409, "A password is already set — use change password instead");
    }
    await setPassword(userId, password);
    res.json(await meResponse(userId));
  } catch (err) {
    next(err);
  }
});

// Requires the current password (not just an active session).
authRouter.post("/change-password", authRateLimiter, async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "currentPassword and newPassword are required");
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ApiError(401, "Current password is incorrect");
    }
    await setPassword(userId, newPassword);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// No auth required (a locked-out user has no session). Always 204 whether or
// not the email exists — anything else would let anyone enumerate accounts.
authRouter.post("/forgot-password", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<{ method: "email" | "sms"; email: string; phone: string }>;

    if (body.method === "sms") {
      const phone = body.phone?.trim();
      assertPhoneAllowed(phone);
      // The code is tied to this browser session; POST /reset-password
      // with { code } completes it here.
      req.session.pendingResetPhone = phone;
      const user = await prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } } });
      if (user) {
        try {
          await sendPhoneCode(user.id, phone, "PASSWORD_RESET");
        } catch (err) {
          // A throttled resend (or paused SMS) must look identical to "no such account".
          if (!(err instanceof ApiError && (err.status === 429 || err.status === 503))) throw err;
        }
      }
      res.status(204).end();
      return;
    }

    const email = body.email?.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, "A valid email is required");
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) await sendPasswordResetEmail(user);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Completes a reset with the emailed link's token or the SMS code, then
// signs the user in ("Update Password & Sign In"). The link proves control
// of the email and the code control of the verified phone, so no further
// 2FA step is needed. Other sessions are revoked unless the user unticks
// "Sign out of all other devices".
authRouter.post("/reset-password", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<ResetPasswordRequest>;
    let userId: string;
    let proofOfEmail = false;

    if (body.token) {
      const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(body.token) } });
      if (!record || record.expiresAt < new Date()) {
        throw new ApiError(400, "This reset link is invalid or has expired", "RESET_LINK_INVALID");
      }
      assertStrongPassword(body.password);
      userId = record.userId;
      proofOfEmail = true;
      await setPassword(userId, body.password);
      await prisma.passwordResetToken.delete({ where: { id: record.id } }); // single use
    } else if (body.code) {
      const phone = req.session.pendingResetPhone;
      const user = phone ? await prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } } }) : null;
      if (!user) throw new ApiError(400, "This code has expired — request a new one", "CODE_EXPIRED");
      assertStrongPassword(body.password);
      await consumePhoneCode(user.id, "PASSWORD_RESET", body.code);
      userId = user.id;
      await setPassword(userId, body.password);
    } else {
      throw new ApiError(400, "A reset link or code is required");
    }

    if (proofOfEmail) {
      await prisma.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    }
    await establishSession(req, userId, { method: "PASSWORD_RESET" });
    if (body.signOutOtherDevices !== false) {
      await revokeOtherSessions(userId, req.sessionID);
    }
    res.json(await meResponse(userId));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------
authRouter.get("/verify-email", async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      throw new ApiError(400, "Missing verification token");
    }
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashVerificationToken(token) } });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, "This verification link is invalid or has expired", "VERIFY_LINK_INVALID");
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.emailVerificationToken.delete({ where: { id: record.id } }),
    ]);
    // The link may be opened in a browser that isn't signed in as this user
    // (another device, a shared computer): report the *session's* user, never
    // the token owner's profile.
    const sessionUserId = req.session.userId;
    res.json(sessionUserId ? await meResponse(sessionUserId) : ({ user: null } satisfies MeResponse));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-verification", authRateLimiter, async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerifiedAt) {
      await sendVerificationEmail(user);
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Sign in: password, then a 6-digit code by email. A correct password alone
// never grants a session; it parks the login as pending until verify-2fa.
// ---------------------------------------------------------------------------
authRouter.post("/login", authRateLimiter, async (req, res, next) => {
  try {
    const body = req.body as Partial<LoginRequest>;
    const email = body.email?.trim().toLowerCase();
    const { password } = body;
    if (!email || !password) {
      throw new ApiError(400, "email and password are required");
    }
    await assertLoginAllowed(email);
    const user = await prisma.user.findUnique({ where: { email } });
    // Same answer for "no account", "no password set" and "wrong password".
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await recordLogin(req, { userId: user?.id, email, method: "PASSWORD", outcome: "FAILED" });
      throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }
    req.session.pendingTwoFactorUserId = user.id;
    req.session.pendingRememberMe = body.rememberMe !== false;
    await sendLoginTwoFactorCode(user, req);
    res.status(202).json({ twoFactorRequired: true } satisfies TwoFactorRequiredResponse);
  } catch (err) {
    next(err);
  }
});

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
      throw new ApiError(400, "This code has expired — request a new one", "CODE_EXPIRED");
    }
    if (record.codeHash !== hashTwoFactorCode(code.trim())) {
      const attempts = record.attempts + 1;
      if (attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
        await prisma.loginTwoFactorCode.delete({ where: { id: record.id } });
        throw new ApiError(400, "Too many incorrect attempts — request a new code", "CODE_ATTEMPTS_EXCEEDED");
      }
      await prisma.loginTwoFactorCode.update({ where: { id: record.id }, data: { attempts } });
      await recordLogin(req, { userId: pendingUserId, method: "TWO_FACTOR", outcome: "FAILED" });
      throw new ApiError(401, "Incorrect code", "CODE_INCORRECT");
    }
    await prisma.loginTwoFactorCode.delete({ where: { id: record.id } });

    const rememberMe = req.session.pendingRememberMe !== false;
    await establishSession(req, pendingUserId, { method: "TWO_FACTOR", rememberMe });
    res.json(await meResponse(pendingUserId));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-2fa", authRateLimiter, async (req, res, next) => {
  try {
    const pendingUserId = req.session.pendingTwoFactorUserId;
    const user = pendingUserId ? await prisma.user.findUnique({ where: { id: pendingUserId } }) : null;
    if (!user) {
      throw new ApiError(401, "No login is pending verification");
    }
    await sendLoginTwoFactorCode(user, req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// "Not you? Use a different account" on the code screen.
authRouter.post("/cancel-2fa", (req, res) => {
  delete req.session.pendingTwoFactorUserId;
  delete req.session.pendingRememberMe;
  res.status(204).end();
});

// Signing out (or deleting the account) empties the browser's HTTP cache for
// the app, so photos and videos (cached privately for a day) can't be seen by
// the next person on a shared device. "cache" only: the service worker's app
// shell and the device's own settings stay.
const CLEAR_CACHE = '"cache"';

authRouter.post("/logout", (req, res, next) => {
  const userId = req.session.userId;
  const sessionId = req.sessionID;
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    const done = () => {
      res.clearCookie("kinnd.sid");
      res.setHeader("Clear-Site-Data", CLEAR_CACHE);
      res.status(204).end();
    };
    if (userId) forgetSession(userId, sessionId).then(done, done);
    else done();
  });
});

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
// Security: how many other devices are signed in, and signing them all out.
authRouter.get("/sessions", async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    res.json({ otherSessions: await countOtherSessions(userId, req.sessionID) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/sessions/revoke-others", async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    res.json({ revoked: await revokeOtherSessions(userId, req.sessionID) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const exists = userId ? await prisma.user.count({ where: { id: userId } }) : 0;
    if (!userId || !exists) {
      res.json({ user: null } satisfies MeResponse);
      return;
    }
    res.json(await meResponse(userId));
  } catch (err) {
    next(err);
  }
});

// Partial account update: avatar, name, email, theme, language. Changing the
// email is a security action — it resets verification and re-sends the
// confirmation email.
authRouter.patch("/me", async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const body = req.body as Partial<UpdateProfileRequest>;
    const { avatarMediaAssetId, firstName, lastName, themeId, locale, region } = body;
    const email = body.email?.trim().toLowerCase();

    if ([avatarMediaAssetId, firstName, lastName, email, themeId, locale, region].every((v) => v === undefined)) {
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
    if (themeId !== undefined && !isThemeId(themeId)) {
      throw new ApiError(400, "Unknown theme");
    }
    if (locale !== undefined && !isLocale(locale)) {
      throw new ApiError(400, "Unsupported language");
    }
    if (region !== undefined && region !== null && !isRegion(region)) {
      throw new ApiError(400, "Unknown country");
    }

    if (avatarMediaAssetId !== undefined) {
      const asset = await withRls(userId, (tx) => tx.mediaAsset.findUnique({ where: { id: avatarMediaAssetId } }));
      if (!asset) throw new ApiError(404, "Media not found");
      if (asset.ownerId !== userId) throw new ApiError(403, "You don't have access to this media");
    }

    const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const emailChanged = email !== undefined && email !== currentUser.email;
    if (emailChanged && (await prisma.user.findUnique({ where: { email } }))) {
      throw new ApiError(409, "An account with this email already exists", "EMAIL_TAKEN");
    }

    const user = await withRls(userId, async (tx) => {
      if (avatarMediaAssetId !== undefined) {
        // Clear the old asset's claim first so the unique constraint never
        // sees two assets on one user.
        await tx.mediaAsset.updateMany({ where: { avatarForUserId: userId }, data: { avatarForUserId: null } });
        await tx.mediaAsset.update({ where: { id: avatarMediaAssetId }, data: { avatarForUserId: userId } });
      }
      return tx.user.update({
        where: { id: userId },
        data: {
          ...(avatarMediaAssetId !== undefined ? { avatarUrl: avatarMediaAssetId } : {}),
          ...(firstName !== undefined ? { firstName } : {}),
          ...(lastName !== undefined ? { lastName } : {}),
          ...(emailChanged ? { email, emailVerifiedAt: null } : {}),
          ...(themeId !== undefined ? { themeId } : {}),
          ...(locale !== undefined ? { locale } : {}),
          ...(region !== undefined ? { region } : {}),
        },
      });
    });

    if (emailChanged) await sendVerificationEmailSafely(user);
    res.json(await meResponse(userId));
  } catch (err) {
    next(err);
  }
});

// GDPR export: the caller's own profile, the children they can access,
// moments they authored, personal notes, and growth entries for children
// they can see (GrowthEntry has no per-entry author).
authRouter.get("/export", async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    const [profile, access, moments, notes] = await Promise.all([
      loadPublicUser(userId),
      prisma.childAccess.findMany({ where: { userId }, include: { child: true } }),
      withRls(userId, (tx) => tx.moment.findMany({ where: { authorId: userId }, include: { media: true } })),
      prisma.personalNote.findMany({ where: { userId } }),
    ]);
    const childIds = access.map((a) => a.childId);
    const growthEntries = childIds.length
      ? await withRls(userId, (tx) => tx.growthEntry.findMany({ where: { childId: { in: childIds } } }))
      : [];

    res.setHeader("Content-Disposition", 'attachment; filename="kinnd-data-export.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      profile,
      children: access.map((a) => ({
        childId: a.childId,
        firstName: a.child.firstName,
        lastName: a.child.lastName,
        birthday: a.child.birthday.toISOString(),
        role: a.role,
      })),
      moments: moments.map((p) => ({
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
    });
  } catch (err) {
    next(err);
  }
});

// Deletes the account. Cascades remove this user's access and content (not
// the children themselves — co-parents may still need them).
authRouter.delete("/me", async (req, res, next) => {
  try {
    const userId = requireSession(req.session.userId);
    // An explicit, typed confirmation — this can't be undone.
    if ((req.body as { confirm?: unknown } | undefined)?.confirm !== true) {
      throw new ApiError(400, "Confirm the deletion", "CONFIRM_REQUIRED");
    }
    await deleteAccount(userId);
    await revokeOtherSessions(userId, req.sessionID);
    req.session.destroy(() => {
      res.clearCookie("kinnd.sid");
      res.setHeader("Clear-Site-Data", CLEAR_CACHE);
      res.status(204).end();
    });
  } catch (err) {
    next(err);
  }
});
