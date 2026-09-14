import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { MAX_CHILDREN_PER_OWNER, MAX_MEMBERS_PER_CHILD } from "./fairUseCaps";

// Phase 10 proof — spec 9.10: soft fair-use caps (10 children / 15 members),
// enforced with a support-contact message rather than the ordinary paywall
// 403. This is also Phase 9's misuse backstop: bootstrapGuardian.test.ts's
// Scenario 3 test found that a solo bootstrap child stays entitlement-
// satisfied at FREE tier forever (requiredTier only rises above FREE once a
// child has 2+ members), so mass-creating many such solo children is never
// caught by billing lapsing — this cap is what actually catches it.
describe("Fair-use caps (spec 9.10)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("blocks the 11th child (mass bootstrap-creation specifically, not just a large legitimate family)", async () => {
    const app = createApp();
    const { agent, userId } = await signupTestUser(app, { email: "mass-bootstrap@example.com" });

    // Fabricate 9 pre-existing bootstrap GUARDIAN grants directly (fast) so
    // the test isn't dominated by 9 real HTTP round trips — what's actually
    // under test is the 10th->11th boundary via the real endpoint.
    for (let i = 0; i < MAX_CHILDREN_PER_OWNER - 1; i++) {
      const child = await prisma.child.create({
        data: { firstName: `Kid${i}`, lastName: "", gender: "GIRL", birthday: new Date("2021-01-01") },
      });
      await prisma.childAccess.create({
        data: { childId: child.id, userId, role: "GUARDIAN", relationship: "GRANDMOTHER_MAT" },
      });
    }

    // The 10th is still allowed (at, not yet over, the cap).
    const tenthRes = await agent.post("/children").send({
      firstName: "Tenth",
      gender: "GIRL",
      birthday: "2021-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Parent", wantsClaimLink: true },
    });
    expect(tenthRes.status).toBe(201);

    // The 11th (whether bootstrap or a genuine parent-shaped creation) is
    // refused with the fair-use, support-contact message — not the ordinary
    // "upgrade your plan" paywall copy.
    const eleventhBootstrap = await agent.post("/children").send({
      firstName: "Eleventh",
      gender: "GIRL",
      birthday: "2021-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Parent", wantsClaimLink: true },
    });
    expect(eleventhBootstrap.status).toBe(403);
    expect(eleventhBootstrap.body.error).toMatch(/fair-use/i);
    expect(eleventhBootstrap.body.error).not.toMatch(/upgrade/i);

    const eleventhParent = await agent.post("/children").send({
      firstName: "AlsoEleventh",
      gender: "GIRL",
      birthday: "2021-01-01",
      relationship: "MOTHER",
    });
    expect(eleventhParent.status).toBe(403);
    expect(eleventhParent.body.error).toMatch(/fair-use/i);
  });

  it("blocks inviting a 16th member onto a child already at 15", async () => {
    const app = createApp();
    const { agent, userId: parentId } = await signupTestUser(app, { email: "full-child-parent@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Full", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    // Fabricate members 2..15 directly (14 more, for 15 total with the
    // creator) — fast, and what's under test is the boundary itself.
    for (let i = 0; i < MAX_MEMBERS_PER_CHILD - 1; i++) {
      const user = await prisma.user.create({
        data: { email: `member${i}@example.com`, passwordHash: "x", firstName: `M${i}`, lastName: "" },
      });
      await prisma.childAccess.create({
        data: { childId, userId: user.id, role: "FAMILY", relationship: "AUNT" },
      });
    }
    const count = await prisma.childAccess.count({ where: { childId } });
    expect(count).toBe(MAX_MEMBERS_PER_CHILD);

    const inviteRes = await agent.post("/invites").send({ childId, relationship: "AUNT", email: "sixteenth@example.com" });
    expect(inviteRes.status).toBe(403);
    expect(inviteRes.body.error).toMatch(/fair-use/i);
    void parentId;
  });

  it("re-checks the cap at accept time, not just at invite-creation time", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "race-parent@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Race", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    // Room for exactly one more (14 fabricated + 1 creator = 15... leave
    // room for the invite to be created validly at 14, then fill the last
    // slot before it's accepted).
    for (let i = 0; i < MAX_MEMBERS_PER_CHILD - 2; i++) {
      const user = await prisma.user.create({
        data: { email: `race-member${i}@example.com`, passwordHash: "x", firstName: `R${i}`, lastName: "" },
      });
      await prisma.childAccess.create({
        data: { childId, userId: user.id, role: "FAMILY", relationship: "UNCLE" },
      });
    }

    const inviteRes = await agent.post("/invites").send({ childId, relationship: "UNCLE", email: "late-joiner@example.com" });
    expect(inviteRes.status).toBe(201);

    // Someone else fills the last slot before this invite is accepted.
    const filler = await prisma.user.create({
      data: { email: "filler@example.com", passwordHash: "x", firstName: "Filler", lastName: "" },
    });
    await prisma.childAccess.create({ data: { childId, userId: filler.id, role: "FAMILY", relationship: "UNCLE" } });

    const acceptAgent = request.agent(app);
    const acceptRes = await acceptAgent
      .post(`/invites/${inviteRes.body.token}/accept`)
      .send({ firstName: "Late", lastName: "Joiner", password: "password123" });
    expect(acceptRes.status).toBe(403);
    expect(acceptRes.body.error).toMatch(/fair-use/i);
  });
});
