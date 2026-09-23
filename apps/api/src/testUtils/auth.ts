import type { Express } from "express";
import request from "supertest";
import type { MeResponse } from "@kidcom/shared";

import { mailSender, MemoryMailSender } from "../lib/mailSender";

let counter = 0;

// Signs up a fresh user against the real app (real password hashing, real
// session cookie via Redis), then verifies their email (extracting the real
// token from the captured verification email, same as a real inbox click) —
// POST /children and POST /invites both require requireVerifiedEmail, so
// almost every integration test needs this to have already happened. Returns
// a supertest agent that carries the session on every subsequent request.
export async function signupTestUser(
  app: Express,
  overrides: Partial<{ email: string; firstName: string; lastName: string }> = {}
) {
  counter += 1;
  const agent = request.agent(app);
  const email = overrides.email ?? `test-user-${counter}-${Date.now()}@example.com`;

  const res = await agent.post("/auth/signup").send({
    email,
    password: "password123",
    firstName: overrides.firstName ?? "Test",
    lastName: overrides.lastName ?? "User",
    acceptedTerms: true,
  });
  if (res.status !== 201) {
    throw new Error(`signupTestUser: signup failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const body = res.body as MeResponse;
  if (!body.user) {
    throw new Error("signupTestUser: signup response had no user");
  }

  await verifyTestUserEmail(agent, email);

  return { agent, userId: body.user.id, email };
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
