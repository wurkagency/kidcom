import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { config } from "../../config";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";

// Google / Microsoft sign-in with the providers mocked at the HTTP boundary
// (token + userinfo endpoints). Covers the flow's security properties:
// state binding, PKCE, the email trust rule, and consent before an account.

type Profile = { sub: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string };

function mockProvider(profile: Profile) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body?.toString() });
      if (url.includes("token")) return new Response(JSON.stringify({ access_token: "at-123" }), { status: 200 });
      return new Response(JSON.stringify(profile), { status: 200 });
    }),
  );
  return calls;
}

async function startAndReturn(agent: ReturnType<typeof request.agent>, provider: string, query = "") {
  const start = await agent.get(`/auth/oauth/${provider}/start${query}`);
  expect(start.status).toBe(302);
  const location = new URL(start.headers.location);
  const state = location.searchParams.get("state")!;
  return { location, state, callback: () => agent.get(`/auth/oauth/${provider}/callback?code=c-1&state=${state}`) };
}

describe("Google / Microsoft sign-in", () => {
  beforeEach(async () => {
    await resetDb();
    Object.assign(config, {
      googleClientId: "g-id",
      googleClientSecret: "g-secret",
      microsoftClientId: "m-id",
      microsoftClientSecret: "m-secret",
      microsoftTenantId: "common",
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to the provider with state, PKCE (S256) and the registered callback", async () => {
    const agent = request.agent(createApp());
    const { location } = await startAndReturn(agent, "google");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:5173/api/auth/oauth/google/callback");

    const ms = await startAndReturn(agent, "microsoft");
    expect(ms.location.href).toContain("login.microsoftonline.com/common/oauth2/v2.0/authorize");
  });

  it("rejects a callback whose state doesn't match the session", async () => {
    const agent = request.agent(createApp());
    await startAndReturn(agent, "google");
    const res = await agent.get("/auth/oauth/google/callback?code=c-1&state=forged");
    expect(res.headers.location).toBe("/login?oauthError=expired");
  });

  it("a new Google identity asks for consent first, then becomes a password-less account", async () => {
    const calls = mockProvider({ sub: "g-new", email: "Nora@Example.com", email_verified: true, given_name: "Nora", family_name: "Berg" });
    const agent = request.agent(createApp());
    const { callback } = await startAndReturn(agent, "google");

    const cb = await callback();
    expect(cb.headers.location).toBe("/signup?continue=oauth");
    expect(calls[0].body).toContain("code_verifier="); // PKCE verifier sent at token exchange
    expect(await prisma.user.count()).toBe(0); // no account without consent

    const pending = await agent.get("/auth/oauth/pending");
    expect(pending.body.pending).toEqual({ provider: "google", email: "nora@example.com", firstName: "Nora", lastName: "Berg" });

    expect((await agent.post("/auth/oauth/complete-signup").send({ acceptedTerms: false })).status).toBe(400);
    const done = await agent.post("/auth/oauth/complete-signup").send({ acceptedTerms: true });
    expect(done.status).toBe(201);
    expect(done.body.user).toMatchObject({ email: "nora@example.com", hasPassword: false, oauthProviders: ["google"] });
    expect(done.body.user.emailVerifiedAt).not.toBeNull(); // Google vouched for it
    expect((await agent.get("/children")).body.code).toBe("PHONE_VERIFICATION_REQUIRED"); // phone still mandatory
  });

  it("consent given on the signup screen creates the account straight away", async () => {
    mockProvider({ sub: "g-2", email: "ola@example.com", email_verified: true, given_name: "Ola" });
    const agent = request.agent(createApp());
    const { callback } = await startAndReturn(agent, "google", "?acceptedTerms=1");
    expect((await callback()).headers.location).toBe("/");
    expect((await agent.get("/auth/me")).body.user.email).toBe("ola@example.com");
  });

  it("links a Google identity to an existing account with the same verified email, and signs in", async () => {
    const app = createApp();
    const { email, userId } = await signupTestUser(app);
    mockProvider({ sub: "g-existing", email, email_verified: true });
    const agent = request.agent(app);
    const { callback } = await startAndReturn(agent, "google", "?next=/calendar");

    expect((await callback()).headers.location).toBe("/calendar");
    expect((await agent.get("/auth/me")).body.user.id).toBe(userId);
    expect(await prisma.oAuthAccount.count({ where: { userId } })).toBe(1);
  });

  it("never attaches a Microsoft identity to an existing account by email (nOAuth)", async () => {
    const app = createApp();
    const { email, userId } = await signupTestUser(app);
    mockProvider({ sub: "m-attacker", email });
    const agent = request.agent(app);
    const { callback } = await startAndReturn(agent, "microsoft");

    expect((await callback()).headers.location).toBe("/login?oauthError=account_exists");
    expect((await agent.get("/auth/me")).body.user).toBeNull();
    expect(await prisma.oAuthAccount.count({ where: { userId } })).toBe(0);
  });

  it("a returning identity signs straight in", async () => {
    mockProvider({ sub: "g-back", email: "back@example.com", email_verified: true });
    const app = createApp();
    const first = request.agent(app);
    await (await startAndReturn(first, "google", "?acceptedTerms=1")).callback();

    const again = request.agent(app);
    const { callback } = await startAndReturn(again, "google");
    expect((await callback()).headers.location).toBe("/");
    expect((await again.get("/auth/me")).body.user.email).toBe("back@example.com");
  });

  it("ignores an off-site `next` target", async () => {
    mockProvider({ sub: "g-3", email: "x@example.com", email_verified: true });
    const agent = request.agent(createApp());
    await (await startAndReturn(agent, "google", "?acceptedTerms=1")).callback();
    const { callback } = await startAndReturn(agent, "google", "?next=//evil.example");
    expect((await callback()).headers.location).toBe("/");
  });
});
