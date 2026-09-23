import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser, verifyInvitedTestUser } from "../../testUtils/auth";
import { can, canViewMedicalInfo } from "../../lib/permissions";

// Phase 10 proof — spec 9.16: sibling accounts get a reduced default, are
// flagged as a minor member (not a new AccessRole), and are created directly
// by a parent rather than invited by email.
describe("Minor sibling accounts (spec 9.16)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("POST /invites refuses a BROTHER/SISTER relationship outright", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "sib-parent@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Eli", gender: "BOY", birthday: "2020-01-01" });
    const res = await agent.post("/invites").send({ childId: childRes.body.id, relationship: "SISTER", email: "sibling@example.com" });
    expect(res.status).toBe(400);
    expect(await prisma.invite.findMany({ where: { email: "sibling@example.com" } })).toHaveLength(0);
  });

  it("a parent creates a sibling's account directly, flagged isMinorMember, with reduced default access", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "sib-parent2@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Nora", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const minorRes = await parentAgent
      .post(`/children/${childId}/family/minor`)
      .send({ firstName: "Sam", lastName: "Sib", relationship: "BROTHER" });
    expect(minorRes.status).toBe(201);
    expect(minorRes.body.userId).toBeTruthy();

    const access = await prisma.childAccess.findUniqueOrThrow({
      where: { childId_userId: { childId, userId: minorRes.body.userId } },
    });
    expect(access.role).toBe("FAMILY");
    expect(access.relationship).toBe("BROTHER");
    expect(access.isMinorMember).toBe(true);

    const familyRes = await parentAgent.get(`/children/${childId}/family`);
    const minorEntry = familyRes.body.members.find((m: { userId: string }) => m.userId === minorRes.body.userId);
    expect(minorEntry.isMinorMember).toBe(true);
  });

  it("a non-parent (GUARDIAN) cannot create a sibling's account", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "sib-parent3@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Ava", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const guardianInvite = await parentAgent.post("/invites").send({ childId, relationship: "GUARDIAN", email: "sib-guardian@example.com" });
    const guardianAgent = request.agent(app);
    await guardianAgent.post(`/invites/${guardianInvite.body.token}/accept`).send({ firstName: "G", lastName: "Uardian", password: "password123" });
    await verifyInvitedTestUser(guardianAgent, "sib-guardian@example.com");

    const res = await guardianAgent.post(`/children/${childId}/family/minor`).send({ firstName: "Sam", relationship: "BROTHER" });
    expect(res.status).toBe(403);
  });

  it("a minor member gets moments/lists access but not swap-requests or medical info, even with medicalInfoAccess opted in", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "sib-parent4@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kai", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;
    const minorRes = await parentAgent
      .post(`/children/${childId}/family/minor`)
      .send({ firstName: "Sib", relationship: "SISTER" });
    const minorUserId = minorRes.body.userId;

    // Even if a parent opts them into medical info visibility (as they might
    // for an ordinary FAMILY member), 9.16 makes the denial absolute for a
    // minor member.
    await prisma.childAccess.update({
      where: { childId_userId: { childId, userId: minorUserId } },
      data: { medicalInfoAccess: true },
    });

    // The minor account has no password (see routes/children/index.ts's
    // family/minor comment) — assert the restrictions directly against the
    // stored access row via the permission helpers, same as this codebase's
    // existing unit-level permissions.test.ts does for other roles.
    const access = await prisma.childAccess.findUniqueOrThrow({
      where: { childId_userId: { childId, userId: minorUserId } },
    });

    expect(can(access, "moments:post")).toBe(true);
    expect(can(access, "list_item:manage")).toBe(true);
    expect(can(access, "swap_request:create")).toBe(false);
    expect(can(access, "calendar_event:manage")).toBe(false);
    expect(can(access, "calendar_event_request:create")).toBe(false);
    expect(can(access, "custody_plan:edit")).toBe(false);
    expect(canViewMedicalInfo(access)).toBe(false);
  });
});
