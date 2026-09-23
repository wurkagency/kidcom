import session from "express-session";
import RedisStore from "connect-redis";
import type { NextFunction, Request, Response } from "express";

import { config } from "../config";
import { redis } from "../redis";
import { prisma } from "../db";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    // Set by POST /login once the password check passes but before the 2FA
    // code is verified — a real session (userId) isn't granted until
    // POST /auth/verify-2fa succeeds. Never used as an auth credential by
    // itself (requireAuth/requireVerifiedEmail only ever check userId).
    pendingTwoFactorUserId?: string;
    // Carries the login form's "Remember me" choice across the pending-2FA
    // gap so POST /verify-2fa can size the session cookie once it actually
    // grants one — see that handler.
    pendingRememberMe?: boolean;
    // Cached "this account has a verified phone" (lib/sessions.ts sets it at
    // sign-in and on phone verification) so requireVerifiedPhone needs no DB
    // lookup per request. Undefined on sessions older than the flag: checked
    // against the DB once, then cached.
    phoneVerified?: boolean;
    // Forgot-password by SMS: the account a reset code was requested for.
    // Set whether or not the email exists (no account enumeration).
    pendingResetEmail?: string;
    // Google/Microsoft round trip (lib/oauth.ts).
    oauth?: { provider: "google" | "microsoft"; state: string; verifier: string; next: string; acceptedTerms: boolean };
    // A Google/Microsoft identity with no KidCom account yet, waiting for the
    // user to accept the terms on the sign-up screen.
    pendingOAuthSignup?: {
      provider: "google" | "microsoft";
      subject: string;
      email: string;
      emailVerified: boolean;
      firstName: string;
      lastName: string;
    };
  }
}

// Real session-cookie auth: express-session backed by the same Redis instance
// the jobs chunk will use for BullMQ. httpOnly always; `secure` only in
// production (local dev is plain HTTP on localhost, so requiring `secure`
// there would silently drop the cookie on every request); domain is unset
// locally and `.kidcom.org` in production (see docs/plesk_deployment.md) so the
// session cookie is shared between the `kidcom.org` and `api.kidcom.org`
// origins.
export const sessionMiddleware = session({
  store: new RedisStore({ client: redis, prefix: "kidcom:sess:" }),
  secret: config.sessionSecret,
  name: "kidcom.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    domain: config.isProduction ? config.cookieDomain : undefined,
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// Anti-spoofing gate: blocks any route that would let an account act on
// other people's data (inviting someone, creating a child, accepting an
// invite into a family) until the caller has proven they control the email
// address on their account. Must run after requireAuth (or do its own
// session check, as here) — it does its own Prisma lookup since req.session
// only carries the userId, not the full user record.
export async function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({ error: "Email verification required" });
    return;
  }
  next();
}

// Phone verification is mandatory (v3.0): a signed-in account without a
// verified phone can reach only what it needs to finish verifying — the
// /auth endpoints — and gets 403 PHONE_VERIFICATION_REQUIRED everywhere else.
// Mounted globally after sessionMiddleware.
const PHONE_GATE_EXEMPT = /^\/(auth|health)(\/|$)/;

export async function requireVerifiedPhone(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.phoneVerified || PHONE_GATE_EXEMPT.test(req.path)) {
    next();
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { phoneVerifiedAt: true } });
  if (user?.phoneVerifiedAt) {
    req.session.phoneVerified = true;
    next();
    return;
  }
  res.status(403).json({ error: "Please verify your mobile number to continue", code: "PHONE_VERIFICATION_REQUIRED" });
}
