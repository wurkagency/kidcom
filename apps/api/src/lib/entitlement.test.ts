import { describe, it, expect, beforeEach } from "vitest";

import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser, verifyTestUserEmail } from "../testUtils/auth";
import { isChildSatisfied, isCustodyPlanLockedPendingParent } from "./entitlement";

describe("isChildSatisfied — direct unit coverage of the DB-wiring layer", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a lone organic parent on Free always satisfies their own single child", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const childRes = await agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2022-01-01" });
    expect(childRes.status).toBe(201);

    expect(await isChildSatisfied(childRes.body.id)).toBe(true);
  });

  it("a child with no ChildAccess rows at all is not satisfied", async () => {
    // Constructed directly — POST /children always grants the creator
    // access, so this state is otherwise unreachable through the API.
    const child = await prisma.child.create({
      data: { firstName: "Orphan", lastName: "", gender: "BOY", birthday: new Date("2020-01-01") },
    });
    expect(await isChildSatisfied(child.id)).toBe(false);
  });
});

describe("I-2 (spec §2.2/§4.3) — trialStartedAt is set once, at account creation, and never changes", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("organic signup grants a trial immediately, and it survives subscribing to a paid plan", async () => {
    const app = createApp();
    const { agent, userId } = await signupTestUser(app);

    const afterSignup = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterSignup.trialStartedAt).not.toBeNull();
    expect(afterSignup.trialEndsAt).not.toBeNull();
    expect(afterSignup.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());

    await agent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "MONTHLY" });
    const afterSubscribe = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterSubscribe.trialStartedAt!.getTime()).toBe(afterSignup.trialStartedAt!.getTime());
    expect(afterSubscribe.trialEndsAt!.getTime()).toBe(afterSignup.trialEndsAt!.getTime());

    await agent.post("/billing/cancel");
    const afterCancel = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterCancel.trialStartedAt!.getTime()).toBe(afterSignup.trialStartedAt!.getTime());
    expect(afterCancel.trialEndsAt!.getTime()).toBe(afterSignup.trialEndsAt!.getTime());
  });
});

describe("isCustodyPlanLockedPendingParent (spec 9.8)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const OLD = 31 * 24 * 60 * 60 * 1000;
  const RECENT = 5 * 24 * 60 * 60 * 1000;

  it("is not locked for a brand-new child, even with only one parent", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const childRes = await agent.post("/children").send({ firstName: "Milo", gender: "BOY", birthday: "2021-01-01" });
    expect(await isCustodyPlanLockedPendingParent(childRes.body.id)).toBe(false);
  });

  it("locks once 30 days have passed with only one parent", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const childRes = await agent.post("/children").send({ firstName: "Milo", gender: "BOY", birthday: "2021-01-01" });
    await prisma.child.update({ where: { id: childRes.body.id }, data: { createdAt: new Date(Date.now() - OLD) } });

    expect(await isCustodyPlanLockedPendingParent(childRes.body.id)).toBe(true);

    const putRes = await agent.put(`/children/${childRes.body.id}/custody-plan`).send({
      label: "Week on/week off",
      startDate: "2026-01-01",
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: "x", days: 7 }] },
    });
    expect(putRes.status).toBe(403);
  });

  it("does not lock once a second parent has joined, even if the child is old", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "parent-locktest@example.com" });
    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Milo", gender: "BOY", birthday: "2021-01-01" });
    await prisma.child.update({ where: { id: childRes.body.id }, data: { createdAt: new Date(Date.now() - OLD) } });

    const inviteRes = await parentAgent
      .post("/invites")
      .send({ childId: childRes.body.id, relationship: "PARENT", email: "second-parent-locktest@example.com" });
    const secondAgent = request.agent(app);
    const acceptRes = await secondAgent.post(`/invites/${inviteRes.body.token}/accept`).send({
      firstName: "Second",
      lastName: "Parent",
      password: "password123",
    });
    await verifyTestUserEmail(secondAgent, "second-parent-locktest@example.com");
    void acceptRes;

    expect(await isCustodyPlanLockedPendingParent(childRes.body.id)).toBe(false);

    const putRes = await parentAgent.put(`/children/${childRes.body.id}/custody-plan`).send({
      label: "Week on/week off",
      startDate: "2026-01-01",
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: "x", days: 7 }] },
    });
    expect(putRes.status).toBe(201);
  });

  it("does not lock a child less than 30 days old with only one parent", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);
    const childRes = await agent.post("/children").send({ firstName: "Milo", gender: "BOY", birthday: "2021-01-01" });
    await prisma.child.update({ where: { id: childRes.body.id }, data: { createdAt: new Date(Date.now() - RECENT) } });

    expect(await isCustodyPlanLockedPendingParent(childRes.body.id)).toBe(false);
  });

  // Phase 9 (spec §2.2b, brief §5's second flagged open item, decided "no"):
  // a bootstrap-created child has ZERO parents, not one — the lock exists to
  // stop one home unilaterally cementing a schedule before the *other* home
  // is present, which presumes a parent already exists to be overridden.
  // With no parent at all, there's no second home being cut out, so this
  // must stay unlocked no matter how old the child gets.
  it("does not lock a bootstrap-guardian child with zero parents, even long after 30 days", async () => {
    const app = createApp();
    const { agent: grandmaAgent } = await signupTestUser(app, { email: "grandma-locktest@example.com" });
    const childRes = await grandmaAgent.post("/children").send({
      firstName: "Zoe",
      gender: "GIRL",
      birthday: "2023-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Zoe's Mom", wantsClaimLink: true },
    });
    expect(childRes.status).toBe(201);
    await prisma.child.update({ where: { id: childRes.body.id }, data: { createdAt: new Date(Date.now() - OLD) } });

    expect(await isCustodyPlanLockedPendingParent(childRes.body.id)).toBe(false);

    const putRes = await grandmaAgent.put(`/children/${childRes.body.id}/custody-plan`).send({
      label: "Week on/week off",
      startDate: "2026-01-01",
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: "x", days: 7 }] },
    });
    // Not blocked by the lock (this assertion's whole point) — still inside
    // her own trial, so the separate entitlement gate passes too, isolating
    // the lock behavior specifically.
    expect(putRes.status).toBe(201);
  });
});
