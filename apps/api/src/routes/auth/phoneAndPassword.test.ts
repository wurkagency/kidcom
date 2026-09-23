import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { lastSmsCode, signupTestUser } from "../../testUtils/auth";
import { smsSender, type MemorySmsSender } from "../../lib/smsSender";

// v3.0 Phase 2: signup without a password, mandatory SMS phone verification
// (enforced server-side), first password + password rules, SMS password
// reset, and session hardening.

const sentTo = (phone: string) => (smsSender as MemorySmsSender).sent.filter((m) => m.to === phone);

async function signupWithoutPassword(app: ReturnType<typeof createApp>, phone: string, email = `p${Date.now()}-${Math.random()}@example.com`) {
  const agent = request.agent(app);
  const res = await agent
    .post("/auth/signup")
    .send({ email, firstName: "Sarah", lastName: "Jenkins", phone, acceptedTerms: true });
  return { agent, res, email };
}

describe("Signup and mandatory phone verification", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects a signup without a valid international mobile number or without consent", async () => {
    const app = createApp();
    const base = { email: "a@example.com", firstName: "A", acceptedTerms: true };
    expect((await request(app).post("/auth/signup").send({ ...base })).status).toBe(400);
    expect((await request(app).post("/auth/signup").send({ ...base, phone: "20123456" })).status).toBe(400);
    expect((await request(app).post("/auth/signup").send({ ...base, phone: "+4520123456", acceptedTerms: false })).status).toBe(400);
  });

  it("creates a signed-in account without a password and texts a code; the number is only stored once verified", async () => {
    const app = createApp();
    const { agent, res } = await signupWithoutPassword(app, "+4520111111");
    expect(res.status).toBe(201);
    expect(res.body.user.hasPassword).toBe(false);
    expect(res.body.user.phone).toBeNull();
    expect(res.body.user.pendingPhone).toBe("+4520111111");
    expect(sentTo("+4520111111")).toHaveLength(1);
    expect(sentTo("+4520111111")[0].content).toMatch(/@localhost:5173 #\d{6}$/); // WebOTP autofill line

    const verify = await agent.post("/auth/phone/verify").send({ code: lastSmsCode("+4520111111") });
    expect(verify.status).toBe(200);
    expect(verify.body.user.phone).toBe("+4520111111");
    expect(verify.body.user.phoneVerifiedAt).not.toBeNull();
    expect(verify.body.user.pendingPhone).toBeNull();
  });

  it("blocks every non-auth endpoint until the phone is verified (server-side, not just the UI)", async () => {
    const app = createApp();
    const { agent } = await signupWithoutPassword(app, "+4520222222");

    const blocked = await agent.get("/children");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PHONE_VERIFICATION_REQUIRED");
    expect((await agent.get("/auth/me")).status).toBe(200); // auth endpoints stay reachable

    await agent.post("/auth/phone/verify").send({ code: lastSmsCode("+4520222222") });
    expect((await agent.get("/children")).status).toBe(200);
  });

  it("caps wrong-code attempts and then requires a new code", async () => {
    const app = createApp();
    const { agent } = await signupWithoutPassword(app, "+4520333333");
    for (let i = 0; i < 4; i++) {
      expect((await agent.post("/auth/phone/verify").send({ code: "000000" })).status).toBe(401);
    }
    const fifth = await agent.post("/auth/phone/verify").send({ code: "000000" });
    expect(fifth.status).toBe(400);
    // The real code no longer works either — it was discarded.
    expect((await agent.post("/auth/phone/verify").send({ code: lastSmsCode("+4520333333") })).status).toBe(400);
  });

  it("a verified number belongs to one account only", async () => {
    const app = createApp();
    const { phone } = await signupTestUser(app);
    const { agent } = await signupWithoutPassword(app, phone);
    const res = await agent.post("/auth/phone/verify").send({ code: lastSmsCode(phone) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PHONE_TAKEN");
    expect((await agent.get("/auth/me")).body.user.phoneVerifiedAt).toBeNull();
  });

  it("throttles resends", async () => {
    const app = createApp();
    const { agent } = await signupWithoutPassword(app, "+4520444444");
    expect((await agent.post("/auth/phone/send").send({})).status).toBe(429);
  });

  it("a phone change keeps the old verified number until the new one is confirmed", async () => {
    const app = createApp();
    const { agent, phone, userId } = await signupTestUser(app);
    await prisma.phoneVerificationCode.deleteMany({ where: { userId } }); // skip the resend cooldown

    expect((await agent.post("/auth/phone/send").send({ phone: "+4520555555" })).status).toBe(204);
    expect((await agent.get("/auth/me")).body.user.phone).toBe(phone);

    const verified = await agent.post("/auth/phone/verify").send({ code: lastSmsCode("+4520555555") });
    expect(verified.body.user.phone).toBe("+4520555555");
  });
});

describe("Passwords", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sets a first password once, enforcing the rules shown on screen", async () => {
    const app = createApp();
    const { agent } = await signupWithoutPassword(app, "+4520666666");
    expect((await agent.post("/auth/password").send({ password: "short1" })).status).toBe(400);
    expect((await agent.post("/auth/password").send({ password: "nonumbershere" })).status).toBe(400);

    const ok = await agent.post("/auth/password").send({ password: "calm-harbour-7" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.hasPassword).toBe(true);
    expect((await agent.post("/auth/password").send({ password: "another-one-8" })).status).toBe(409);
  });

  it("refuses a password used in the past 90 days", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app); // password123
    const change = (currentPassword: string, newPassword: string) =>
      agent.post("/auth/change-password").send({ currentPassword, newPassword });

    expect((await change("password123", "password123")).status).toBe(400);
    expect((await change("password123", "second-pass-2")).status).toBe(204);
    const reused = await change("second-pass-2", "password123"); // back to the old one
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe("PASSWORD_REUSED");
    expect((await change("second-pass-2", "third-pass-3")).status).toBe(204);
  });

  it("an account without a password cannot sign in with one (same error as a wrong password)", async () => {
    const app = createApp();
    const { email } = await signupWithoutPassword(app, "+4520777777");
    const res = await request(app).post("/auth/login").send({ email, password: "anything-1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("Password reset by SMS", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("texts a code to the verified number; the code resets, signs in, and signs out other devices", async () => {
    const app = createApp();
    const { agent: otherDevice, email, phone, userId } = await signupTestUser(app);
    await prisma.phoneVerificationCode.deleteMany({ where: { userId } });

    const resetter = request.agent(app);
    expect((await resetter.post("/auth/forgot-password").send({ phone, method: "sms" })).status).toBe(204);
    const code = lastSmsCode(phone);

    const reset = await resetter.post("/auth/reset-password").send({ code, password: "fresh-start-9" });
    expect(reset.status).toBe(200);
    expect(reset.body.user.email).toBe(email);
    expect((await resetter.get("/children")).status).toBe(200); // signed in

    expect((await otherDevice.get("/auth/me")).body.user).toBeNull(); // revoked
    expect((await request(app).post("/auth/login").send({ email, password: "fresh-start-9" })).status).toBe(202);
  });

  it("keeps other devices signed in when the user unticks the option", async () => {
    const app = createApp();
    const { agent: otherDevice, email, phone, userId } = await signupTestUser(app);
    await prisma.phoneVerificationCode.deleteMany({ where: { userId } });

    const resetter = request.agent(app);
    await resetter.post("/auth/forgot-password").send({ phone, method: "sms" });
    await resetter.post("/auth/reset-password").send({ code: lastSmsCode(phone), password: "fresh-start-9", signOutOtherDevices: false });
    expect((await otherDevice.get("/auth/me")).body.user?.email).toBe(email);
  });

  it("answers identically for an unknown number and sends nothing", async () => {
    const app = createApp();
    const before = (smsSender as MemorySmsSender).sent.length;
    const res = await request(app).post("/auth/forgot-password").send({ phone: "+4599999999", method: "sms" });
    expect(res.status).toBe(204);
    expect((smsSender as MemorySmsSender).sent.length).toBe(before);
  });

  it("a code cannot be used from a different browser session", async () => {
    const app = createApp();
    const { phone, userId } = await signupTestUser(app);
    await prisma.phoneVerificationCode.deleteMany({ where: { userId } });
    await request.agent(app).post("/auth/forgot-password").send({ phone, method: "sms" });

    const stranger = await request(app).post("/auth/reset-password").send({ code: lastSmsCode(phone), password: "fresh-start-9" });
    expect(stranger.status).toBe(400);
  });
});

describe("Email verification links", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("verifies the account, but never reveals it to a browser not signed in as it", async () => {
    const app = createApp();
    const { agent } = await signupWithoutPassword(app, "+4520888888", "link@example.com");
    const { MemoryMailSender, mailSender } = await import("../../lib/mailSender");
    const mail = [...(mailSender as InstanceType<typeof MemoryMailSender>).sent].reverse().find((m) => m.to === "link@example.com");
    const token = mail!.text.match(/token=([a-f0-9]+)/)![1];

    const elsewhere = await request(app).get(`/auth/verify-email?token=${token}`);
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.body.user).toBeNull();
    expect((await agent.get("/auth/me")).body.user.emailVerifiedAt).not.toBeNull();
  });
});

describe("Session hardening", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("issues a new session id at sign-in (no session fixation)", async () => {
    const app = createApp();
    const { email } = await signupTestUser(app);
    const agent = request.agent(app);

    const login = await agent.post("/auth/login").send({ email, password: "password123" });
    const before = String(login.headers["set-cookie"]).match(/kidcom\.sid=([^;]+)/)?.[1];
    const { MemoryMailSender, mailSender } = await import("../../lib/mailSender");
    const mail = [...(mailSender as InstanceType<typeof MemoryMailSender>).sent].reverse().find((m) => m.to === email);
    const code = mail!.text.match(/\b(\d{6})\b/)![1];

    const verify = await agent.post("/auth/verify-2fa").send({ code });
    const after = String(verify.headers["set-cookie"]).match(/kidcom\.sid=([^;]+)/)?.[1];
    expect(verify.status).toBe(200);
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});
