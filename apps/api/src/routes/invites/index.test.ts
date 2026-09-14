import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser, verifyTestUserEmail } from "../../testUtils/auth";

describe("POST /invites — D1: only a PARENT may invite", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects an invite from a FAMILY-role holder (e.g. an invited grandparent) with 403", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "parent@example.com" });

    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Emma", gender: "GIRL", birthday: "2020-01-01" });
    expect(childRes.status).toBe(201);
    const childId = childRes.body.id;

    // Parent invites a grandmother -> FAMILY-role access (relationshipTypeToRole).
    const inviteRes = await parentAgent
      .post("/invites")
      .send({ childId, relationship: "GRANDMOTHER_MAT", email: "grandma@example.com" });
    expect(inviteRes.status).toBe(201);

    const grandmaAgent = request.agent(app);
    const acceptRes = await grandmaAgent.post(`/invites/${inviteRes.body.token}/accept`).send({
      firstName: "Grandma",
      lastName: "G",
      password: "password123",
    });
    expect(acceptRes.status).toBe(200);
    await verifyTestUserEmail(grandmaAgent, "grandma@example.com");

    // Previously (D1): any ChildAccess row passed the check, so a FAMILY
    // member could invite someone as FATHER/MOTHER/PARENT and grant them
    // PARENT access.
    const escalationAttempt = await grandmaAgent
      .post("/invites")
      .send({ childId, relationship: "PARENT", email: "new-co-parent@example.com" });
    expect(escalationAttempt.status).toBe(403);

    // Confirm no invite row was actually created for the rejected attempt.
    const invites = await prisma.invite.findMany({ where: { email: "new-co-parent@example.com" } });
    expect(invites).toHaveLength(0);
  });

  it("still allows a PARENT-role holder to invite", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "parent2@example.com" });
    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Noah", gender: "BOY", birthday: "2021-01-01" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent
      .post("/invites")
      .send({ childId, relationship: "GRANDFATHER_PAT", email: "grandpa@example.com" });
    expect(inviteRes.status).toBe(201);
  });
});

describe("D3: organic and invited signups land in equivalent gated states", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an invited user's mutations are not blocked once their 30-day trial has expired, same as an organic Free signup", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "parent3@example.com" });
    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Liam", gender: "BOY", birthday: "2019-06-01" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent
      .post("/invites")
      .send({ childId, relationship: "GRANDMOTHER_MAT", email: "grandma2@example.com" });

    const grandmaAgent = request.agent(app);
    const acceptRes = await grandmaAgent.post(`/invites/${inviteRes.body.token}/accept`).send({
      firstName: "Grandma",
      lastName: "Two",
      password: "password123",
    });
    const grandmaUserId = acceptRes.body.user.id;
    await verifyTestUserEmail(grandmaAgent, "grandma2@example.com");

    // Simulate her 30-day trial having ended yesterday — this is exactly
    // the state that previously hard-blocked every mutation under
    // /children for her (D3), while an organic Free signup (trialEndsAt:
    // null) was never blocked for the same nominal FREE tier.
    await prisma.subscription.update({
      where: { ownerId: grandmaUserId },
      data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    // A journal post, not a child-basic-info PATCH: as of Phase 3's
    // permission matrix, editing basic info is PARENT-only regardless of
    // trial state — posting to the journal is a capability her FAMILY role
    // actually has (spec §1.4), so it's the right mutation to prove D3's
    // fix with.
    const postRes = await grandmaAgent.post(`/children/${childId}/journal`).send({ title: "Hello from Grandma" });
    expect(postRes.status).toBe(201);
  });

  it("an organic Free signup (trialEndsAt: null) is never blocked from child mutations", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "organic@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2022-01-01" });
    expect(childRes.status).toBe(201);

    const patchRes = await agent.patch(`/children/${childRes.body.id}`).send({ clothingSize: "2T" });
    expect(patchRes.status).toBe(200);
  });
});
