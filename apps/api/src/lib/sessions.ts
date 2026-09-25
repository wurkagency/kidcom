import type { NextFunction, Request, Response } from "express";
import type { LoginMethod } from "@kinnd/db";

import { prisma } from "../db";
import { redis } from "../redis";
import { recordLogin } from "./loginEvents";

// Session lifecycle helpers. Every sign-in (password + 2FA, signup, Google/
// Microsoft, password reset) goes through establishSession so they all get
// the same protections:
//  - a fresh session id (no session fixation: an id planted before sign-in
//    never becomes an authenticated session);
//  - the id recorded in a per-user index, so "sign out of all other devices"
//    can find and destroy the others;
//  - the phone-verified flag cached on the session (see requireVerifiedPhone);
//  - a login event (IP, user agent, method) for manage.kinnd.eu.

const SESSION_PREFIX = "kinnd:sess:"; // must match middleware/session.ts
const indexKey = (userId: string) => `kinnd:usess:${userId}`;

/**
 * Sessions slide: each visit restarts the clock, so a family using the app
 * (installed on the home screen or not) stays signed in; after this long
 * without any visit the session expires. Unticked "Remember me" still gives a
 * browser-session cookie instead (shared devices).
 */
export const SESSION_IDLE_MS = 1000 * 60 * 60 * 24 * 90;
// A little longer than any session can live, refreshed while it's in use.
const INDEX_TTL_SECONDS = Math.ceil(SESSION_IDLE_MS / 1000) + 60 * 60 * 24 * 7;
const INDEX_REFRESH_MS = 1000 * 60 * 60 * 24;

function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

function save(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

/**
 * Keeps a long-lived session in its user's index (at most once a day per
 * session), so "sign out of all other devices" and password resets still find
 * a session that has slid on for months.
 */
export function keepSessionIndexed(req: Request, _res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  const last = req.session?.indexedAt ?? 0;
  if (!userId || Date.now() - last < INDEX_REFRESH_MS) return next();
  req.session.indexedAt = Date.now();
  redis
    .multi()
    .sadd(indexKey(userId), req.sessionID)
    .expire(indexKey(userId), INDEX_TTL_SECONDS)
    .exec()
    .then(() => next(), next);
}

export async function establishSession(req: Request, userId: string, options: { method: LoginMethod; rememberMe?: boolean }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phoneVerifiedAt: true } });
  await regenerate(req);
  req.session.userId = userId;
  req.session.phoneVerified = Boolean(user.phoneVerifiedAt);
  // Unchecked "Remember me": a browser-session cookie instead of the default
  // 30-day one. express-session documents `expires = false` for exactly this.
  if (options.rememberMe === false) {
    req.session.cookie.expires = false as unknown as Date;
  }
  await save(req);
  req.session.indexedAt = Date.now();
  await redis.multi().sadd(indexKey(userId), req.sessionID).expire(indexKey(userId), INDEX_TTL_SECONDS).exec();
  await recordLogin(req, { userId, method: options.method, outcome: "SUCCESS" });
}

/** Other live sessions of `userId` (index entries whose session still exists). */
export async function countOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const ids = (await redis.smembers(indexKey(userId))).filter((id) => id !== keepSessionId);
  if (ids.length === 0) return 0;
  const alive = await redis.exists(...ids.map((id) => `${SESSION_PREFIX}${id}`));
  return alive;
}

/** Destroys every session of `userId` except `keepSessionId`. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const ids = await redis.smembers(indexKey(userId));
  const others = ids.filter((id) => id !== keepSessionId);
  if (others.length > 0) {
    await redis
      .multi()
      .del(...others.map((id) => `${SESSION_PREFIX}${id}`))
      .srem(indexKey(userId), ...others)
      .exec();
  }
  return others.length;
}

export async function forgetSession(userId: string, sessionId: string) {
  await redis.srem(indexKey(userId), sessionId);
}
