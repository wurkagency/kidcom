import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { config } from "../config";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { smsSender, type MemorySmsSender } from "../lib/smsSender";
import { SMS_PER_NUMBER_PER_DAY } from "../lib/phoneVerification";

// SMS pumping (toll fraud) guard — security sweep 2026-09-24. Attackers script
// sign-ups or "send code" calls to premium-rate numbers and share the fees our
// SMS provider charges. The API only texts the countries the app offers, caps
// texts per number across accounts, and caps the total per 24 hours.

const sentTo = (phone: string) => (smsSender as MemorySmsSender).sent.filter((m) => m.to === phone).length;

const signup = (app: ReturnType<typeof createApp>, phone: string, email: string) =>
  request(app).post("/auth/signup").send({ email, firstName: "Test", lastName: "Person", phone, acceptedTerms: true });

describe("SMS toll-fraud guard", () => {
  beforeEach(resetDb);

  it("won't sign up (or text) a number outside the offered countries", async () => {
    const app = createApp();
    for (const phone of ["+18765550123", "+79161234567", "+447012345678"]) {
      const res = await signup(app, phone, `pump-${phone.slice(1)}@example.com`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PHONE_COUNTRY_UNSUPPORTED");
      expect(sentTo(phone)).toBe(0);
    }
    expect(await prisma.user.count({ where: { email: { startsWith: "pump-" } } })).toBe(0);

    const us = await signup(app, "+12015550123", "us-parent@example.com");
    expect(us.status).toBe(201);
  });

  it("won't change to, or reset by, an unsupported number", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    const change = await me.agent.post("/auth/phone/send").send({ phone: "+18095550123" });
    expect(change.body.code).toBe("PHONE_COUNTRY_UNSUPPORTED");
    const reset = await request(app).post("/auth/forgot-password").send({ method: "sms", phone: "+18095550123" });
    expect(reset.body.code).toBe("PHONE_COUNTRY_UNSUPPORTED");
  });

  it(`caps texts to one number at ${SMS_PER_NUMBER_PER_DAY} a day, however many accounts ask`, async () => {
    const app = createApp();
    const victim = "+4529990001";
    const accounts = [];
    for (let i = 0; i <= SMS_PER_NUMBER_PER_DAY; i++) accounts.push(await signupTestUser(app));

    for (const account of accounts.slice(0, SMS_PER_NUMBER_PER_DAY)) {
      expect((await account.agent.post("/auth/phone/send").send({ phone: victim })).status).toBe(204);
    }
    const blocked = await accounts[SMS_PER_NUMBER_PER_DAY]!.agent.post("/auth/phone/send").send({ phone: victim });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("SMS_LIMIT");
    expect(sentTo(victim)).toBe(SMS_PER_NUMBER_PER_DAY);
    expect(await prisma.smsSend.count({ where: { phone: victim } })).toBe(SMS_PER_NUMBER_PER_DAY);
  });

  it("pauses all SMS at the daily total, with an alert, and creates no account it can't text", async () => {
    const app = createApp();
    const a = await signupTestUser(app);
    const b = await signupTestUser(app);
    const alert = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = config.smsDailyLimit;
    config.smsDailyLimit = (await prisma.smsSend.count()) + 1;
    try {
      expect((await a.agent.post("/auth/phone/send").send({ phone: "+4529990002" })).status).toBe(204);

      const paused = await b.agent.post("/auth/phone/send").send({ phone: "+4529990003" });
      expect(paused.status).toBe(503);
      expect(paused.body.code).toBe("SMS_UNAVAILABLE");
      expect(sentTo("+4529990003")).toBe(0);
      expect(alert).toHaveBeenCalledWith(expect.stringContaining("[ALERT] SMS daily limit reached"));

      const newcomer = await signup(app, "+4529990004", "newcomer@example.com");
      expect(newcomer.status).toBe(503);
      expect(await prisma.user.count({ where: { email: "newcomer@example.com" } })).toBe(0);
    } finally {
      config.smsDailyLimit = original;
      alert.mockRestore();
    }
  });

  it("password reset by SMS stays silent when capped — no hint whether the account exists", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    await prisma.smsSend.createMany({
      data: Array.from({ length: SMS_PER_NUMBER_PER_DAY }, () => ({ phone: me.phone, purpose: "PASSWORD_RESET" as const })),
    });
    const before = sentTo(me.phone);
    const res = await request(app).post("/auth/forgot-password").send({ method: "sms", phone: me.phone });
    expect(res.status).toBe(204); // same as for an unknown number
    expect(sentTo(me.phone)).toBe(before);
  });

  it("a text the provider refuses isn't counted, and says so instead of a server error", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    const phone = "+4529990002";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.spyOn(smsSender, "send").mockRejectedValue(new Error("Brevo SMS failed (401): unrecognised IP address"));
    for (let i = 0; i < SMS_PER_NUMBER_PER_DAY + 2; i++) {
      const res = await me.agent.post("/auth/phone/send").send({ phone });
      expect(res.status).toBe(502);
      expect(res.body.code).toBe("SMS_SEND_FAILED");
    }
    expect(await prisma.smsSend.count({ where: { phone } })).toBe(0);
    expect(await prisma.phoneVerificationCode.count({ where: { userId: me.userId } })).toBe(0);

    send.mockRestore();
    const before = sentTo(phone);
    expect((await me.agent.post("/auth/phone/send").send({ phone })).status).toBe(204);
    expect(sentTo(phone)).toBe(before + 1);
    expect(await prisma.smsSend.count({ where: { phone } })).toBe(1);
  });

  it("a sign-up whose text fails still creates the account and sends the email", async () => {
    const app = createApp();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.spyOn(smsSender, "send").mockRejectedValue(new Error("Brevo SMS failed (401)"));
    const res = await signup(app, "+4529990003", "sms-down@example.com");
    send.mockRestore();
    expect(res.status).toBe(201);
    const { MemoryMailSender, mailSender } = await import("../lib/mailSender");
    expect((mailSender as InstanceType<typeof MemoryMailSender>).sent.some((m) => m.to === "sms-down@example.com")).toBe(true);
    expect(await prisma.smsSend.count({ where: { phone: "+4529990003" } })).toBe(0);
  });
});
