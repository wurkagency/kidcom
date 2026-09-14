import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";
import { mailSender, MemoryMailSender } from "../../lib/mailSender";

// Post-launch backlog Phase F proof — password reset didn't exist at all
// before this (change-password required an active session + the current
// password). Same token-extraction pattern testUtils/auth.ts's
// verifyTestUserEmail already uses for email verification.
function extractResetToken(email: string): string {
  const sender = mailSender as MemoryMailSender;
  const resetEmail = [...sender.sent].reverse().find((m) => m.to === email && m.subject.toLowerCase().includes("reset your password"));
  if (!resetEmail) throw new Error(`no password-reset email captured for ${email}`);
  const match = resetEmail.text.match(/token=([a-f0-9]+)/);
  if (!match) throw new Error(`no token found in password-reset email for ${email}`);
  return match[1];
}

describe("Password reset (post-launch backlog Phase F)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("requesting a reset, then using the token, changes the password — old password stops working, new one works", async () => {
    const app = createApp();
    const { email } = await signupTestUser(app, { email: "reset-flow@example.com" });

    const forgotRes = await request(app).post("/auth/forgot-password").send({ email });
    expect(forgotRes.status).toBe(204);

    const token = extractResetToken(email);
    const resetRes = await request(app).post("/auth/reset-password").send({ token, password: "newpassword123" });
    expect(resetRes.status).toBe(204);

    const oldLoginRes = await request(app).post("/auth/login").send({ email, password: "password123" });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app).post("/auth/login").send({ email, password: "newpassword123" });
    expect(newLoginRes.status).toBe(202);
    expect(newLoginRes.body.twoFactorRequired).toBe(true);
  });

  it("a used token cannot be reused", async () => {
    const app = createApp();
    const { email } = await signupTestUser(app, { email: "reset-reuse@example.com" });
    await request(app).post("/auth/forgot-password").send({ email });
    const token = extractResetToken(email);

    const firstUse = await request(app).post("/auth/reset-password").send({ token, password: "newpassword123" });
    expect(firstUse.status).toBe(204);

    const secondUse = await request(app).post("/auth/reset-password").send({ token, password: "anotherpassword456" });
    expect(secondUse.status).toBe(400);
  });

  it("requesting a reset for a non-existent email still returns 204 with no email sent (no account-enumeration leak)", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/forgot-password").send({ email: "nobody-here@example.com" });
    expect(res.status).toBe(204);

    const sender = mailSender as MemoryMailSender;
    const sentToNobody = sender.sent.find((m) => m.to === "nobody-here@example.com");
    expect(sentToNobody).toBeUndefined();
  });

  it("an expired token is rejected", async () => {
    const app = createApp();
    const { email, userId } = await signupTestUser(app, { email: "reset-expired@example.com" });
    await request(app).post("/auth/forgot-password").send({ email });
    const token = extractResetToken(email);

    await prisma.passwordResetToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post("/auth/reset-password").send({ token, password: "newpassword123" });
    expect(res.status).toBe(400);
  });

  it("re-requesting a reset replaces the previous token rather than accumulating one per request", async () => {
    const app = createApp();
    const { email, userId } = await signupTestUser(app, { email: "reset-rerequest@example.com" });
    await request(app).post("/auth/forgot-password").send({ email });
    await request(app).post("/auth/forgot-password").send({ email });

    const count = await prisma.passwordResetToken.count({ where: { userId } });
    expect(count).toBe(1);
  });
});
