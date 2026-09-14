import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";

// Phase 6a (spec §1.5/9.20) proof.
describe("AccessGrantEvent — spec §1.5/9.20", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("logs a bootstrap grant (no inviter, no accept delay) when a child is created directly", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent
      .post("/children")
      .send({ firstName: "Emma", gender: "GIRL", birthday: "2020-01-01", relationship: "MOTHER" });
    expect(res.status).toBe(201);

    const events = await prisma.accessGrantEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0].relationship).toBe("MOTHER");
    expect(events[0].inviterRelationship).toBeNull();
    expect(events[0].timeToAcceptMs).toBeNull();
  });

  it("logs an invite-accept grant with the inviter's own relationship and a positive time-to-accept", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "mom@example.com" });
    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Noah", gender: "BOY", birthday: "2021-01-01", relationship: "MOTHER" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent
      .post("/invites")
      .send({ childId, relationship: "GRANDMOTHER_MAT", email: "grandma@example.com" });

    const grandmaAgent = request.agent(app);
    await grandmaAgent.post(`/invites/${inviteRes.body.token}/accept`).send({
      firstName: "Grandma",
      lastName: "G",
      password: "password123",
    });

    // Two events total: the mother's own bootstrap grant, and the
    // grandmother's invite-accept grant.
    const events = await prisma.accessGrantEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(2);
    const grandmaEvent = events[1];
    expect(grandmaEvent.relationship).toBe("GRANDMOTHER_MAT");
    expect(grandmaEvent.inviterRelationship).toBe("MOTHER");
    expect(grandmaEvent.timeToAcceptMs).not.toBeNull();
    expect(grandmaEvent.timeToAcceptMs!).toBeGreaterThanOrEqual(0);
  });

  it("does not double-log accept-as-me when the user already had access to the child", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "dad@example.com" });
    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Liam", gender: "BOY", birthday: "2019-01-01", relationship: "FATHER" });
    const childId = childRes.body.id;

    const { agent: auntAgent, email: auntEmail } = await signupTestUser(app, { email: "aunt@example.com" });
    const inviteRes = await parentAgent
      .post("/invites")
      .send({ childId, relationship: "AUNT", email: auntEmail });

    const beforeCount = await prisma.accessGrantEvent.count();
    const acceptRes = await auntAgent.post(`/invites/${inviteRes.body.token}/accept-as-me`);
    expect(acceptRes.status).toBe(200);
    const afterFirstAccept = await prisma.accessGrantEvent.count();
    expect(afterFirstAccept).toBe(beforeCount + 1);

    // Re-invite the same aunt (a second invite row) and accept-as-me again —
    // she already has ChildAccess, so this must NOT log a second grant.
    const secondInviteRes = await parentAgent
      .post("/invites")
      .send({ childId, relationship: "AUNT", email: auntEmail });
    await auntAgent.post(`/invites/${secondInviteRes.body.token}/accept-as-me`);
    const afterSecondAccept = await prisma.accessGrantEvent.count();
    expect(afterSecondAccept).toBe(afterFirstAccept);
  });

  it("events carry no childId/userId/email — cannot be joined back to a person at the schema level", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    await agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2022-01-01" });

    const [event] = await prisma.accessGrantEvent.findMany();
    const keys = Object.keys(event);
    // Also proves spec §1.5's "never derive a gender dimension" hard no by
    // construction: there is no field here a gender value could even be
    // written into.
    expect(keys.sort()).toEqual(["createdAt", "id", "inviterRelationship", "relationship", "timeToAcceptMs"].sort());
  });

  it("the create() call passed to Prisma never includes a gender field (spec §1.5's hard no)", () => {
    const source = fs.readFileSync(path.join(__dirname, "accessGrantAnalytics.ts"), "utf-8");
    const dataBlockMatch = source.match(/data:\s*\{[^}]*\}/);
    expect(dataBlockMatch).not.toBeNull();
    expect(dataBlockMatch![0].toLowerCase()).not.toContain("gender");
  });
});
