import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";

// Phases 3 & 4 proof: the permission-matrix *policy* (lib/permissions.test.ts)
// is only half the story — this proves each capability is actually wired
// into its real route, over real HTTP, against a real (test) database. One
// PARENT, one GUARDIAN, one plain FAMILY member (grandparent), and one
// Caregiver (also AccessRole FAMILY, with the 9.5 restrictions) share one
// child throughout. Every row is created directly via prisma rather than
// through the real invite flow — simpler for a fixture that just needs a
// role/relationship pair to exist, and avoids coupling this matrix-focused
// suite to invites/index.test.ts's own coverage of that flow.
async function setupChildWithRoles() {
  const app = createApp();
  const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "matrix-parent@example.com" });
  const childRes = await parentAgent.post("/children").send({ firstName: "Matrix", gender: "GIRL", birthday: "2020-01-01" });
  const childId = childRes.body.id;

  const { agent: guardianAgent, userId: guardianId } = await signupTestUser(app, { email: "matrix-guardian@example.com" });
  await prisma.childAccess.create({ data: { childId, userId: guardianId, role: "GUARDIAN", relationship: "GUARDIAN" } });

  const { agent: familyAgent, userId: familyId } = await signupTestUser(app, { email: "matrix-family@example.com" });
  await prisma.childAccess.create({ data: { childId, userId: familyId, role: "FAMILY", relationship: "GRANDMOTHER_MAT" } });

  const { agent: caregiverAgent, userId: caregiverId } = await signupTestUser(app, { email: "matrix-caregiver@example.com" });
  await prisma.childAccess.create({ data: { childId, userId: caregiverId, role: "FAMILY", relationship: "CAREGIVER" } });

  return { app, childId, parentAgent, parentId, guardianAgent, guardianId, familyAgent, familyId, caregiverAgent, caregiverId };
}

describe("Permission matrix (spec §1.4) — wired into real routes", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("custody plan: PARENT can edit, FAMILY cannot", async () => {
    const { parentAgent, familyAgent, childId, parentId } = await setupChildWithRoles();
    const body = { label: "Week on/week off", startDate: "2026-01-01", patternDays: { cycleLengthDays: 14, blocks: [{ userId: parentId, days: 7 }] } };

    const parentRes = await parentAgent.put(`/children/${childId}/custody-plan`).send(body);
    expect(parentRes.status).toBe(201);

    const familyRes = await familyAgent.put(`/children/${childId}/custody-plan`).send(body);
    expect(familyRes.status).toBe(403);
  });

  it("calendar events: PARENT can create/edit/delete, FAMILY cannot (spec: FAMILY gets 'request', not built yet)", async () => {
    const { parentAgent, familyAgent, childId } = await setupChildWithRoles();

    const familyCreate = await familyAgent.post(`/children/${childId}/calendar-events`).send({
      categoryIds: ["cat_appointment"],
      title: "Dentist",
      startsAt: "2026-02-01T10:00:00Z",
    });
    expect(familyCreate.status).toBe(403);

    const parentCreate = await parentAgent.post(`/children/${childId}/calendar-events`).send({
      categoryIds: ["cat_appointment"],
      title: "Dentist",
      startsAt: "2026-02-01T10:00:00Z",
    });
    expect(parentCreate.status).toBe(201);
    const eventId = parentCreate.body.id;

    const familyPatch = await familyAgent.patch(`/children/${childId}/calendar-events/${eventId}`).send({ title: "Dentist (moved)" });
    expect(familyPatch.status).toBe(403);

    const parentPatch = await parentAgent.patch(`/children/${childId}/calendar-events/${eventId}`).send({ title: "Dentist (moved)" });
    expect(parentPatch.status).toBe(200);

    const familyDelete = await familyAgent.delete(`/children/${childId}/calendar-events/${eventId}`);
    expect(familyDelete.status).toBe(403);
  });

  it("swap requests: FAMILY may create, Caregiver may not; approval is PARENT-only", async () => {
    const { parentAgent, familyAgent, caregiverAgent, childId } = await setupChildWithRoles();

    const caregiverCreate = await caregiverAgent.post(`/children/${childId}/swap-requests`).send({ date: "2026-03-01" });
    expect(caregiverCreate.status).toBe(403);

    const familyCreate = await familyAgent.post(`/children/${childId}/swap-requests`).send({ date: "2026-03-01" });
    expect(familyCreate.status).toBe(201);
    const requestId = familyCreate.body.id;

    const familyApprove = await familyAgent.patch(`/children/${childId}/swap-requests/${requestId}`).send({ status: "APPROVED" });
    expect(familyApprove.status).toBe(403);

    const parentApprove = await parentAgent.patch(`/children/${childId}/swap-requests/${requestId}`).send({ status: "APPROVED" });
    expect(parentApprove.status).toBe(200);
  });

  it("child basic info: PARENT can edit, FAMILY cannot", async () => {
    const { parentAgent, familyAgent, childId } = await setupChildWithRoles();

    const familyPatch = await familyAgent.patch(`/children/${childId}`).send({ clothingSize: "5T" });
    expect(familyPatch.status).toBe(403);

    const parentPatch = await parentAgent.patch(`/children/${childId}`).send({ clothingSize: "5T" });
    expect(parentPatch.status).toBe(200);
  });

  it("medical info: view is opt-in for FAMILY, edit is PARENT-only", async () => {
    const { parentAgent, familyAgent, childId, familyId } = await setupChildWithRoles();

    const familyEditAttempt = await familyAgent
      .post(`/children/${childId}/medical-info`)
      .send({ category: "ALLERGY", condition: "Peanuts" });
    expect(familyEditAttempt.status).toBe(403);

    const familyViewBeforeOptIn = await familyAgent.get(`/children/${childId}/medical-info`);
    expect(familyViewBeforeOptIn.status).toBe(403);

    const parentCreate = await parentAgent
      .post(`/children/${childId}/medical-info`)
      .send({ category: "ALLERGY", condition: "Peanuts" });
    expect(parentCreate.status).toBe(201);

    // Grant the opt-in directly (the parent-facing UI for this is out of
    // scope for Phase 3 — the schema/gate is what's being proven here).
    await prisma.childAccess.update({
      where: { childId_userId: { childId, userId: familyId } },
      data: { medicalInfoAccess: true },
    });

    const familyViewAfterOptIn = await familyAgent.get(`/children/${childId}/medical-info`);
    expect(familyViewAfterOptIn.status).toBe(200);
    expect(familyViewAfterOptIn.body.items).toHaveLength(1);
  });

  it("growth entries: PARENT-only", async () => {
    const { parentAgent, familyAgent, childId } = await setupChildWithRoles();

    const familyAttempt = await familyAgent.post(`/children/${childId}/growth-entries`).send({ measuredAt: "2026-01-01", heightCm: 100 });
    expect(familyAttempt.status).toBe(403);

    const parentAttempt = await parentAgent.post(`/children/${childId}/growth-entries`).send({ measuredAt: "2026-01-01", heightCm: 100 });
    expect(parentAttempt.status).toBe(201);
  });

  it("moments: FAMILY may post, Caregiver may only comment", async () => {
    const { parentAgent, familyAgent, caregiverAgent, childId } = await setupChildWithRoles();

    const caregiverPost = await caregiverAgent.post(`/children/${childId}/moments`).send({ title: "Hi" });
    expect(caregiverPost.status).toBe(403);

    const familyPost = await familyAgent.post(`/children/${childId}/moments`).send({ title: "Grandma's visit" });
    expect(familyPost.status).toBe(201);
    const postId = familyPost.body.id;

    // Caregiver can still comment (spec 9.5) — momentComments.ts is
    // deliberately ungated.
    const caregiverComment = await caregiverAgent.post(`/children/${childId}/moments/${postId}/comments`).send({ text: "Lovely!" });
    expect(caregiverComment.status).toBe(201);

    const parentPost = await parentAgent.post(`/children/${childId}/moments`).send({ title: "From dad" });
    expect(parentPost.status).toBe(201);
  });

  it("lists: FAMILY may add, Caregiver may only claim", async () => {
    const { familyAgent, caregiverAgent, childId } = await setupChildWithRoles();

    const caregiverAdd = await caregiverAgent.post(`/children/${childId}/lists`).send({ type: "WISHLIST", title: "Bike" });
    expect(caregiverAdd.status).toBe(403);

    const familyAdd = await familyAgent.post(`/children/${childId}/lists`).send({ type: "WISHLIST", title: "Bike" });
    expect(familyAdd.status).toBe(201);
    const itemId = familyAdd.body.id;

    // Caregiver can still claim (spec 9.5) — the claim endpoint is
    // deliberately ungated.
    const caregiverClaim = await caregiverAgent.patch(`/children/${childId}/lists/${itemId}/claim`).send({});
    expect(caregiverClaim.status).toBe(200);
    expect(caregiverClaim.body.claimedById).toBeTruthy();
  });

  it("member removal: PARENT can remove a FAMILY member; FAMILY cannot remove anyone", async () => {
    const { parentAgent, familyAgent, childId, familyId, parentId } = await setupChildWithRoles();

    const familyAttempt = await familyAgent.delete(`/children/${childId}/family/${parentId}`);
    expect(familyAttempt.status).toBe(403);

    const removeFamily = await parentAgent.delete(`/children/${childId}/family/${familyId}`);
    expect(removeFamily.status).toBe(204);

    const remaining = await prisma.childAccess.findUnique({ where: { childId_userId: { childId, userId: familyId } } });
    expect(remaining).toBeNull();
  });

  it("parents and guardians can't remove each other; the last one can't leave", async () => {
    const { parentAgent, guardianAgent, childId, parentId, guardianId } = await setupChildWithRoles();

    // Both have legal rights to the child: neither removes the other (support does).
    const parentRemovesGuardian = await parentAgent.delete(`/children/${childId}/family/${guardianId}`);
    expect(parentRemovesGuardian.status).toBe(403);
    expect(parentRemovesGuardian.body.code).toBe("CANNOT_REMOVE_PARENT");

    // The guardian may leave while a parent remains...
    expect((await guardianAgent.delete(`/children/${childId}/family/${guardianId}`)).status).toBe(204);
    // ...but the last parent or guardian can't.
    const lastLeaves = await parentAgent.delete(`/children/${childId}/family/${parentId}`);
    expect(lastLeaves.status).toBe(400);
    expect(lastLeaves.body.code).toBe("LAST_PARENT");
  });
});

describe("Phase 4 — GUARDIAN: full parity with PARENT on the child's record", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("can edit the custody plan, medical info, and child basic info — same as a Parent", async () => {
    const { guardianAgent, childId, guardianId } = await setupChildWithRoles();

    const custodyRes = await guardianAgent.put(`/children/${childId}/custody-plan`).send({
      label: "Week on/week off",
      startDate: "2026-01-01",
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: guardianId, days: 7 }] },
    });
    expect(custodyRes.status).toBe(201);

    const medicalRes = await guardianAgent.post(`/children/${childId}/medical-info`).send({ category: "ALLERGY", condition: "Bees" });
    expect(medicalRes.status).toBe(201);

    const basicInfoRes = await guardianAgent.patch(`/children/${childId}`).send({ clothingSize: "6T" });
    expect(basicInfoRes.status).toBe(200);
  });

  it("sees medical info unconditionally — no opt-in flag needed, unlike FAMILY", async () => {
    const { parentAgent, guardianAgent, childId } = await setupChildWithRoles();
    await parentAgent.post(`/children/${childId}/medical-info`).send({ category: "CONDITION", condition: "Asthma" });

    const viewRes = await guardianAgent.get(`/children/${childId}/medical-info`);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.items).toHaveLength(1);
  });

  it("can invite a Family/Caregiver member", async () => {
    const { guardianAgent, childId } = await setupChildWithRoles();

    const inviteRes = await guardianAgent
      .post("/invites")
      .send({ childId, relationship: "AUNT", email: "auntie@example.com" });
    expect(inviteRes.status).toBe(201);
  });

  it("the asymmetry: cannot invite or remove a Parent, and cannot remove another Guardian", async () => {
    const { app, guardianAgent, childId, parentId } = await setupChildWithRoles();

    const inviteParentAttempt = await guardianAgent
      .post("/invites")
      .send({ childId, relationship: "PARENT", email: "sneaky-co-parent@example.com" });
    expect(inviteParentAttempt.status).toBe(403);

    const removeParentAttempt = await guardianAgent.delete(`/children/${childId}/family/${parentId}`);
    expect(removeParentAttempt.status).toBe(403);

    // A second Guardian on the same child — the first Guardian may not
    // remove them.
    const { userId: secondGuardianId } = await signupTestUser(app, { email: "second-guardian@example.com" });
    await prisma.childAccess.create({ data: { childId, userId: secondGuardianId, role: "GUARDIAN", relationship: "GUARDIAN" } });

    const removeGuardianAttempt = await guardianAgent.delete(`/children/${childId}/family/${secondGuardianId}`);
    expect(removeGuardianAttempt.status).toBe(403);
  });

  it("can remove a Family/Caregiver member (unlike the Parent-only capabilities above)", async () => {
    const { guardianAgent, childId, familyId } = await setupChildWithRoles();

    const removeRes = await guardianAgent.delete(`/children/${childId}/family/${familyId}`);
    expect(removeRes.status).toBe(204);
  });
});
