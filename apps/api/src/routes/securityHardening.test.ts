import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { config } from "../config";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { SESSION_IDLE_MS } from "../lib/sessions";
import { LOGIN_FAILURE_LIMIT } from "./auth";

// Security sweep follow-ups: the CSRF client header, the per-account
// sign-in limit, sliding sessions and clearing the browser cache on sign-out.

beforeEach(async () => {
  await resetDb();
});

describe("CSRF client header", () => {
  beforeEach(() => {
    config.requireClientHeader = true;
  });
  afterEach(() => {
    config.requireClientHeader = false;
  });

  it("refuses a state-changing request without X-KidCom-Client, and accepts it with", async () => {
    const app = createApp();
    const refused = await request(app).post("/auth/login").send({ email: "a@example.com", password: "x" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("CLIENT_HEADER_REQUIRED");

    const allowed = await request(app).post("/auth/login").set("X-KidCom-Client", "1").send({ email: "a@example.com", password: "x" });
    expect(allowed.status).toBe(401);
  });

  it("leaves reads and QuickPay's signed callback alone", async () => {
    const app = createApp();
    expect((await request(app).get("/billing/plans")).status).toBe(200);
    // Not 403: it reaches the signature check (and fails it).
    expect((await request(app).post("/billing/webhook").send({ id: 1 })).status).toBe(401);
  });
});

describe("per-account sign-in limit", () => {
  it(`locks an account for 15 minutes after ${LOGIN_FAILURE_LIMIT} wrong passwords, even with the right one`, async () => {
    const app = createApp();
    const { email } = await signupTestUser(app);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) {
      expect((await request(app).post("/auth/login").send({ email, password: `wrong-${i}` })).status).toBe(401);
    }
    const locked = await request(app).post("/auth/login").send({ email: email.toUpperCase(), password: "password123" });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("answers the same for an email with no account, so the limit doesn't reveal who has one", async () => {
    const app = createApp();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) {
      await request(app).post("/auth/login").send({ email: "nobody@example.com", password: "x" });
    }
    expect((await request(app).post("/auth/login").send({ email: "nobody@example.com", password: "x" })).body.code).toBe("TOO_MANY_ATTEMPTS");
    // Other accounts are unaffected.
    expect((await request(app).post("/auth/login").send({ email: "someone@example.com", password: "x" })).status).toBe(401);
  });
});

describe("sessions", () => {
  const maxAgeOf = (res: request.Response) => {
    const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("kidcom.sid="));
    return cookie ? new Date(/Expires=([^;]+)/i.exec(cookie)![1]).getTime() - Date.now() : null;
  };

  it("stay signed in for 90 days of inactivity, renewed on every visit", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    // Each request sends a fresh cookie with the full 90 days again.
    const remaining = maxAgeOf(res);
    expect(remaining).not.toBeNull();
    expect(Math.abs(remaining! - SESSION_IDLE_MS)).toBeLessThan(60_000);
  });

  it("signing out clears the browser's cache of the app (photos, videos)", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const res = await agent.post("/auth/logout");
    expect(res.status).toBe(204);
    expect(res.headers["clear-site-data"]).toBe('"cache"');
    expect((await agent.get("/auth/me")).body.user ?? null).toBeNull();
  });
});
