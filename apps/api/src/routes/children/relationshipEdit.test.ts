import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser, verifyTestUserEmail } from "../../testUtils/auth";

// Post-launch backlog Phase B proof — PATCH /children/:childId/family/:userId
// self-corrects a relationship label (most importantly the Phase 5
// migration's arbitrary GRANDPARENT/AUNT_UNCLE/SIBLING guesses) without
// reopening a privilege-escalation hole.
describe("PATCH /children/:childId/family/:userId — relationship self-correction", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a member can correct their own non-parent relationship to another non-parent value", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "rel-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent.post("/invites").send({ childId, relationship: "GRANDMOTHER_MAT", email: "rel-grandma@example.com" });
    const grandmaAgent = request.agent(app);
    await grandmaAgent.post(`/invites/${inviteRes.body.token}/accept`).send({ firstName: "G", lastName: "Ma", password: "password123" });
    await verifyTestUserEmail(grandmaAgent, "rel-grandma@example.com");
    const grandmaId = (await prisma.user.findUniqueOrThrow({ where: { email: "rel-grandma@example.com" } })).id;

    // She was actually the paternal grandmother, not maternal — self-correct.
    const patchRes = await grandmaAgent
      .patch(`/children/${childId}/family/${grandmaId}`)
      .send({ relationship: "GRANDMOTHER_PAT" });
    expect(patchRes.status).toBe(200);

    const access = await prisma.childAccess.findUniqueOrThrow({ where: { childId_userId: { childId, userId: grandmaId } } });
    expect(access.relationship).toBe("GRANDMOTHER_PAT");
    expect(access.role).toBe("FAMILY");
  });

  it("rejects a self-edit that would cross from non-parent-shaped into parent-shaped (the escalation this guards against)", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "esc-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent.post("/invites").send({ childId, relationship: "AUNT", email: "esc-aunt@example.com" });
    const auntAgent = request.agent(app);
    await auntAgent.post(`/invites/${inviteRes.body.token}/accept`).send({ firstName: "A", lastName: "Unt", password: "password123" });
    await verifyTestUserEmail(auntAgent, "esc-aunt@example.com");
    const auntId = (await prisma.user.findUniqueOrThrow({ where: { email: "esc-aunt@example.com" } })).id;

    const patchRes = await auntAgent.patch(`/children/${childId}/family/${auntId}`).send({ relationship: "FATHER" });
    expect(patchRes.status).toBe(400);

    const access = await prisma.childAccess.findUniqueOrThrow({ where: { childId_userId: { childId, userId: auntId } } });
    expect(access.role).toBe("FAMILY");
    expect(access.relationship).toBe("AUNT");
  });

  it("a PARENT-role member's relationship stays parent-shaped even when a parent edits it", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "pshape-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01", relationship: "MOTHER" });
    const childId = childRes.body.id;

    // A parent can correct FATHER<->MOTHER<->PARENT among themselves...
    const okRes = await parentAgent.patch(`/children/${childId}/family/${parentId}`).send({ relationship: "PARENT" });
    expect(okRes.status).toBe(200);

    // ...but not out into a non-parent value, even as themselves.
    const badRes = await parentAgent.patch(`/children/${childId}/family/${parentId}`).send({ relationship: "AUNT" });
    expect(badRes.status).toBe(400);
  });

  it("a member cannot toggle their own Caregiver restriction on or off", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "care-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent.post("/invites").send({ childId, relationship: "CAREGIVER", email: "care-giver@example.com" });
    const caregiverAgent = request.agent(app);
    await caregiverAgent.post(`/invites/${inviteRes.body.token}/accept`).send({ firstName: "C", lastName: "G", password: "password123" });
    await verifyTestUserEmail(caregiverAgent, "care-giver@example.com");
    const caregiverId = (await prisma.user.findUniqueOrThrow({ where: { email: "care-giver@example.com" } })).id;

    // Self-attempt to shed the Caregiver restriction — denied.
    const selfRes = await caregiverAgent.patch(`/children/${childId}/family/${caregiverId}`).send({ relationship: "OTHER" });
    expect(selfRes.status).toBe(403);

    // The parent, who has standing authority over this member, can do it.
    const parentRes = await parentAgent.patch(`/children/${childId}/family/${caregiverId}`).send({ relationship: "OTHER" });
    expect(parentRes.status).toBe(200);
    const access = await prisma.childAccess.findUniqueOrThrow({ where: { childId_userId: { childId, userId: caregiverId } } });
    expect(access.relationship).toBe("OTHER");
  });

  it("a GUARDIAN can edit a FAMILY member's relationship but not a PARENT's", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "gedit-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01", relationship: "MOTHER" });
    const childId = childRes.body.id;

    const guardianInvite = await parentAgent.post("/invites").send({ childId, relationship: "GUARDIAN", email: "gedit-guardian@example.com" });
    const guardianAgent = request.agent(app);
    await guardianAgent.post(`/invites/${guardianInvite.body.token}/accept`).send({ firstName: "G", lastName: "Uard", password: "password123" });
    await verifyTestUserEmail(guardianAgent, "gedit-guardian@example.com");

    const auntInvite = await parentAgent.post("/invites").send({ childId, relationship: "AUNT", email: "gedit-aunt@example.com" });
    const auntAgent = request.agent(app);
    await auntAgent.post(`/invites/${auntInvite.body.token}/accept`).send({ firstName: "A", lastName: "Unt", password: "password123" });
    await verifyTestUserEmail(auntAgent, "gedit-aunt@example.com");
    const auntId = (await prisma.user.findUniqueOrThrow({ where: { email: "gedit-aunt@example.com" } })).id;

    const editAuntRes = await guardianAgent.patch(`/children/${childId}/family/${auntId}`).send({ relationship: "UNCLE" });
    expect(editAuntRes.status).toBe(200);

    const editParentRes = await guardianAgent.patch(`/children/${childId}/family/${parentId}`).send({ relationship: "MOTHER" });
    expect(editParentRes.status).toBe(403);
  });
});
