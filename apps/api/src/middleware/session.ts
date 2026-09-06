import session from "express-session";
import RedisStore from "connect-redis";
import type { NextFunction, Request, Response } from "express";

import { config } from "../config";
import { redis } from "../redis";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

// Real session-cookie auth: express-session backed by the same Redis instance
// the jobs chunk will use for BullMQ. httpOnly always; `secure` only in
// production (local dev is plain HTTP on localhost, so requiring `secure`
// there would silently drop the cookie on every request); domain is unset
// locally and `.kidcom.org` in production (see DEPLOYMENT.md) so the
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
