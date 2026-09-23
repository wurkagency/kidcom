import type { Request } from "express";
import type { LoginMethod, LoginOutcome } from "@kidcom/db";

import { withRlsBypass } from "./rls";

// Sign-ins and failed attempts with their IP and user agent, for
// manage.kidcom.org's abuse and fraud checks (compared with where media was
// uploaded from). Never sent to app clients; see docs/data_retention_policy.md.
// Recording must never block or break a sign-in, so failures are only logged.

/** Login events are kept 12 months (docs/data_retention_policy.md). */
export const LOGIN_EVENT_RETENTION_DAYS = 365;

export async function purgeExpiredLoginEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - LOGIN_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await withRlsBypass((tx) => tx.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }));
  return count;
}

export async function recordLogin(
  req: Request,
  event: { userId?: string | null; email?: string | null; method: LoginMethod; outcome: LoginOutcome },
): Promise<void> {
  try {
    await withRlsBypass((tx) =>
      tx.loginEvent.create({
        data: {
          userId: event.userId ?? null,
          email: event.email?.trim().toLowerCase().slice(0, 320) ?? null,
          method: event.method,
          outcome: event.outcome,
          ip: req.ip ?? null,
          userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
        },
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to record login event:", err);
  }
}
