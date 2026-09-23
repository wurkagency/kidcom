import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";

// PATCH /auth/me's presentation preferences (themeId, locale). A new account
// has neither (the client resolves the code-level defaults); a choice
// persists on the account, not the device, and unknown values are rejected.
describe("PATCH /auth/me — themeId and locale", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a fresh account has no themeId or locale", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.themeId).toBeNull();
    expect(res.body.user.locale).toBeNull();
  });

  it("setting a valid themeId and locale round-trips on GET /auth/me", async () => {
    const app = createApp();
    const { agent, email } = await signupTestUser(app);

    const patchRes = await agent.patch("/auth/me").send({ themeId: "aura", locale: "da-DK" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.themeId).toBe("aura");
    expect(patchRes.body.user.locale).toBe("da-DK");

    const meRes = await agent.get("/auth/me");
    expect(meRes.body.user.themeId).toBe("aura");
    expect(meRes.body.user.locale).toBe("da-DK");

    const secondAgent = request.agent(app);
    const loginRes = await secondAgent.post("/auth/login").send({ email, password: "password123" });
    expect(loginRes.status).toBe(202); // 2FA required, same as every login in this app
  });

  it("an unknown themeId is rejected and not persisted", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.patch("/auth/me").send({ themeId: "not-a-real-theme" });
    expect(res.status).toBe(400);

    const meRes = await agent.get("/auth/me");
    expect(meRes.body.user.themeId).toBeNull();
  });

  it("an unsupported locale is rejected and not persisted", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.patch("/auth/me").send({ locale: "fr-FR" });
    expect(res.status).toBe(400);

    const meRes = await agent.get("/auth/me");
    expect(meRes.body.user.locale).toBeNull();
  });

  it("existing name update behavior is unaffected by the new fields", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.patch("/auth/me").send({ firstName: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe("Updated");
    expect(res.body.user.themeId).toBeNull();
    expect(res.body.user.locale).toBeNull();
  });
});
