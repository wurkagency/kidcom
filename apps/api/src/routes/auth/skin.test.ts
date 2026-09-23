import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";

// PATCH /auth/me's skinId field. A brand-new account has no skinId (resolves
// client-side to DEFAULT_SKIN); setting one persists on the account, not
// just the device, and survives across sessions (a second login sees it too,
// not just the one that set it). "aura" is the only valid value since the
// v3.0 single-theme consolidation (2026-09-22).
describe("PATCH /auth/me — skinId (v2.0 theming)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a fresh account has no skinId", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.skinId).toBeNull();
  });

  it("setting a valid skinId round-trips on GET /auth/me and a later login", async () => {
    const app = createApp();
    const { agent, email } = await signupTestUser(app);

    const patchRes = await agent.patch("/auth/me").send({ skinId: "aura" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.skinId).toBe("aura");

    const meRes = await agent.get("/auth/me");
    expect(meRes.body.user.skinId).toBe("aura");

    // A separate session (e.g. a second device) sees the same persisted
    // choice — this is the actual behavior change from the pre-v2.0
    // localStorage-only skin.
    const secondAgent = request.agent(app);
    const loginRes = await secondAgent.post("/auth/login").send({ email, password: "password123" });
    expect(loginRes.status).toBe(202); // 2FA required, same as every login in this app
  });

  it("an unknown skinId is rejected and not persisted", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.patch("/auth/me").send({ skinId: "not-a-real-skin" });
    expect(res.status).toBe(400);

    const meRes = await agent.get("/auth/me");
    expect(meRes.body.user.skinId).toBeNull();
  });

  it("existing name/email update behavior is unaffected by the new field", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.patch("/auth/me").send({ firstName: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe("Updated");
    expect(res.body.user.skinId).toBeNull();
  });
});
