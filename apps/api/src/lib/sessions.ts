import type { Request } from "express";

import { prisma } from "../db";
import { redis } from "../redis";

// Session lifecycle helpers. Every sign-in (password + 2FA, signup, Google/
// Microsoft, password reset) goes through establishSession so they all get
// the same protections:
//  - a fresh session id (no session fixation: an id planted before sign-in
//    never becomes an authenticated session);
//  - the id recorded in a per-user index, so "sign out of all other devices"
//    can find and destroy the others;
//  - the phone-verified flag cached on the session (see requireVerifiedPhone).

const SESSION_PREFIX = "kidcom:sess:"; // must match middleware/session.ts
const indexKey = (userId: string) => `kidcom:usess:${userId}`;
const INDEX_TTL_SECONDS = 60 * 60 * 24 * 31;

function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

function save(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

export async function establishSession(req: Request, userId: string, options: { rememberMe?: boolean } = {}) {
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
  await redis.multi().sadd(indexKey(userId), req.sessionID).expire(indexKey(userId), INDEX_TTL_SECONDS).exec();
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
