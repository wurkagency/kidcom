import type { Express } from "express";
import request from "supertest";
import type { MeResponse } from "@kidcom/shared";

import { mailSender, MemoryMailSender } from "../lib/mailSender";
import { smsSender, MemorySmsSender } from "../lib/smsSender";
import { prisma } from "../db";
import { onCircleActivated } from "../lib/billingActivation";

/** Switches a user's Circle on directly (no QuickPay), paid for a year. */
export async function giveCircle(userId: string, tier: "PARENTS" | "FAMILY"): Promise<string> {
  const sub = await prisma.subscription.upsert({
    where: { ownerId: userId },
    update: { tier, status: "ACTIVE", billingPeriod: "ANNUAL", currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000) },
    create: { ownerId: userId, tier, status: "ACTIVE", billingPeriod: "ANNUAL", currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000) },
  });
  await onCircleActivated(sub.id);
  return sub.id;
}

let counter = 0;

// Signs up a fresh user against the real app (real password hashing, real
// session cookie via Redis), verifies their phone (the real SMS code, read
// from the captured SMS) and then their email (the real token from the
// captured verification email, same as a real inbox click) —
// POST /children and POST /invites both require requireVerifiedEmail, so
// almost every integration test needs this to have already happened. Returns
// a supertest agent that carries the session on every subsequent request.
export async function signupTestUser(
  app: Express,
  overrides: Partial<{ email: string; firstName: string; lastName: string; plan: "SINGLE" | "PARENTS" | "FAMILY" }> = {}
) {
  counter += 1;
  const agent = request.agent(app);
  const email = overrides.email ?? `test-user-${counter}-${Date.now()}@example.com`;

  const phone = `+4520${String(counter).padStart(6, "0")}`;
  const res = await agent.post("/auth/signup").send({
    email,
    password: "password123",
    firstName: overrides.firstName ?? "Test",
    lastName: overrides.lastName ?? "User",
    phone,
    acceptedTerms: true,
  });
  if (res.status !== 201) {
    throw new Error(`signupTestUser: signup failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const body = res.body as MeResponse;
  if (!body.user) {
    throw new Error("signupTestUser: signup response had no user");
  }

  await verifyTestUserPhone(agent, phone);
  await verifyTestUserEmail(agent, email);

  // Subscription model: a Single can't invite anyone and holds 2 children.
  // Most suites test other features, so a test user gets a Family Circle
  // unless the test asks for a plan.
  const plan = overrides.plan ?? "FAMILY";
  if (plan !== "SINGLE") await giveCircle(body.user.id, plan);

  return { agent, userId: body.user.id, email, phone };
}

/** The 6-digit code in the most recent SMS captured for `phone`. */
export function lastSmsCode(phone: string): string {
  const sms = [...(smsSender as MemorySmsSender).sent].reverse().find((m) => m.to === phone);
  const code = sms?.content.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`lastSmsCode: no SMS code captured for ${phone}`);
  return code;
}

export async function verifyTestUserPhone(agent: ReturnType<typeof request.agent>, phone: string): Promise<void> {
  const res = await agent.post("/auth/phone/verify").send({ code: lastSmsCode(phone) });
  if (res.status !== 200) {
    throw new Error(`verifyTestUserPhone: failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

// Finds the most recent verification email sent to `email` (captured by
// MemoryMailSender under NODE_ENV=test) and completes the real verify-email
// flow with it — used by signupTestUser above and by the invite-accept path
// (routes/invites/index.ts also calls sendVerificationEmail for a brand-new
// invited account).
export async function verifyTestUserEmail(agent: ReturnType<typeof request.agent>, email: string): Promise<void> {
  const sender = mailSender as MemoryMailSender;
  const verificationEmail = [...sender.sent].reverse().find((m) => m.to === email && m.subject.toLowerCase().includes("verify"));
  if (!verificationEmail) {
    throw new Error(`verifyTestUserEmail: no verification email captured for ${email}`);
  }
  const match = verificationEmail.text.match(/token=([a-f0-9]+)/);
  if (!match) {
    throw new Error(`verifyTestUserEmail: could not find a token in the verification email for ${email}`);
  }
  const verifyRes = await agent.get(`/auth/verify-email?token=${match[1]}`);
  if (verifyRes.status !== 200) {
    throw new Error(`verifyTestUserEmail: verify-email failed (${verifyRes.status}): ${JSON.stringify(verifyRes.body)}`);
  }
}

let invitedCounter = 0;

// An account created by accepting an invite has neither a verified phone nor
// email yet. Completes both the real way (SMS code, then email link).
export async function verifyInvitedTestUser(agent: ReturnType<typeof request.agent>, email: string): Promise<void> {
  invitedCounter += 1;
  const phone = `+4530${String(invitedCounter).padStart(6, "0")}`;
  const sendRes = await agent.post("/auth/phone/send").send({ phone });
  if (sendRes.status !== 204) {
    throw new Error(`verifyInvitedTestUser: phone/send failed (${sendRes.status}): ${JSON.stringify(sendRes.body)}`);
  }
  await verifyTestUserPhone(agent, phone);
  await verifyTestUserEmail(agent, email);
}
