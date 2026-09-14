import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser, verifyTestUserEmail } from "../testUtils/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

async function acceptInvite(app: ReturnType<typeof createApp>, token: string, email: string, firstName: string, lastName: string) {
  const agent = request.agent(app);
  const res = await agent.post(`/invites/${token}/accept`).send({ firstName, lastName, password: "password123" });
  expect(res.status).toBe(200);
  await verifyTestUserEmail(agent, email);
  return { agent, userId: res.body.user.id as string };
}

function custodyPlanBody(userId: string) {
  return { label: "Week on/week off", startDate: "2026-01-01", patternDays: { cycleLengthDays: 14, blocks: [{ userId, days: 7 }] } };
}

// Phase 8 proof — spec §4.2's safety floor, precisely.
describe("§4.2 safety floor — custody-plan writes never lapse for a PARENT, always lapse for a GUARDIAN", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("(a) both parents' custody-plan writes keep working even after the payer's subscription is canceled and both trials expire", async () => {
    const app = createApp();
    const { agent: aAgent, userId: aId } = await signupTestUser(app, { email: "parent-a@example.com" });
    const sub = await aAgent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY" });
    expect(sub.status).toBe(200);
    const childRes = await aAgent
      .post("/children")
      .send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01", relationship: "PARENT" });
    const childId = childRes.body.id;

    const inviteRes = await aAgent.post("/invites").send({ childId, relationship: "PARENT", email: "parent-b@example.com" });
    const { agent: bAgent, userId: bId } = await acceptInvite(app, inviteRes.body.token, "parent-b@example.com", "B", "Parent");

    // Kill the payer's subscription and expire both parents' own trials —
    // nothing at all should now satisfy this child at PARENTS tier.
    await aAgent.post("/billing/cancel");
    await prisma.user.updateMany({ where: { id: { in: [aId, bId] } }, data: { trialEndsAt: new Date(Date.now() - DAY_MS) } });

    // Prove the child really is unsatisfied for an ordinary route first —
    // otherwise this test would trivially pass for the wrong reason.
    const journalAttempt = await bAgent.post(`/children/${childId}/journal`).send({ title: "Should be blocked" });
    expect(journalAttempt.status).toBe(403);

    // Both parents can still write the custody plan, unconditionally.
    const aCustody = await aAgent.put(`/children/${childId}/custody-plan`).send(custodyPlanBody(aId));
    expect(aCustody.status).toBe(201);
    const bCustody = await bAgent.put(`/children/${childId}/custody-plan`).send(custodyPlanBody(bId));
    expect(bCustody.status).toBe(201);
  });

  it("(b) a GUARDIAN's custody-plan writes DO eventually lapse once nothing covers the child", async () => {
    const app = createApp();
    const { agent: guardianAgent, userId: guardianId } = await signupTestUser(app, { email: "guardian@example.com" });
    const childRes = await guardianAgent
      .post("/children")
      .send({ firstName: "Kid", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    // Direct construction (pre-Phase-9: no bootstrap-creator flow exists
    // yet) — demote the creator to GUARDIAN and add a FAMILY-role member so
    // requiredTier is FAMILY, not trivially satisfiable by the permanent
    // Free floor once her trial runs out.
    await prisma.childAccess.update({
      where: { childId_userId: { childId, userId: guardianId } },
      data: { role: "GUARDIAN" },
    });
    const { userId: auntId } = await signupTestUser(app, { email: "aunt@example.com" });
    await prisma.childAccess.create({
      data: { childId, userId: auntId, role: "FAMILY", relationship: "AUNT" },
    });

    // Within her own trial, she's still fine — proves the *lapse* is really
    // about entitlement, not some other unrelated block.
    const withinTrial = await guardianAgent.put(`/children/${childId}/custody-plan`).send(custodyPlanBody(guardianId));
    expect(withinTrial.status).toBe(201);

    await prisma.user.update({ where: { id: guardianId }, data: { trialEndsAt: new Date(Date.now() - DAY_MS) } });

    const afterTrialCustody = await guardianAgent.put(`/children/${childId}/custody-plan`).send(custodyPlanBody(guardianId));
    expect(afterTrialCustody.status).toBe(403);
    const afterTrialJournal = await guardianAgent.post(`/children/${childId}/journal`).send({ title: "Should be blocked" });
    expect(afterTrialJournal.status).toBe(403);
  });
});

describe("Phase 8 — grace period + take-over offer (spec 9.12/§4.2 pt.4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("(c) the take-over signal (inGraceWindow) appears while the child is still satisfied, then flips to unsatisfied once the grace period runs out", async () => {
    const app = createApp();
    const { agent: aAgent, userId: aId } = await signupTestUser(app, { email: "payer@example.com" });
    await aAgent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY" });
    const childRes = await aAgent
      .post("/children")
      .send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01", relationship: "PARENT" });
    const childId = childRes.body.id;

    const inviteRes = await aAgent.post("/invites").send({ childId, relationship: "PARENT", email: "co-parent@example.com" });
    const { agent: bAgent, userId: bId } = await acceptInvite(app, inviteRes.body.token, "co-parent@example.com", "Co", "Parent");
    // Both trials expired — only A's real PARENTS subscription is covering
    // this child from here on, so its PAST_DUE transition is the only thing
    // that matters to the assertions below.
    await prisma.user.updateMany({ where: { id: { in: [aId, bId] } }, data: { trialEndsAt: new Date(Date.now() - DAY_MS) } });

    // Simulate what the QuickPay webhook does on a failed charge, without
    // fighting its checksum machinery in a test — same net DB effect.
    await prisma.subscription.update({ where: { ownerId: aId }, data: { status: "PAST_DUE", pastDueSince: new Date() } });

    // Still within the 7-day grace window: satisfied, AND the take-over
    // signal is already up — "before it becomes unsatisfied, not after."
    const duringGrace = await bAgent.get(`/children/${childId}/coverage`);
    expect(duringGrace.status).toBe(200);
    expect(duringGrace.body.satisfied).toBe(true);
    expect(duringGrace.body.inGraceWindow).toBe(true);
    expect(duringGrace.body.satisfyingParentIds).toContain(aId);

    const writeDuringGrace = await bAgent.post(`/children/${childId}/journal`).send({ title: "Still fine" });
    expect(writeDuringGrace.status).toBe(201);

    // Past the 7-day grace period: unsatisfied for real.
    await prisma.subscription.update({
      where: { ownerId: aId },
      data: { pastDueSince: new Date(Date.now() - 8 * DAY_MS) },
    });

    const afterGrace = await bAgent.get(`/children/${childId}/coverage`);
    expect(afterGrace.body.satisfied).toBe(false);
    expect(afterGrace.body.inGraceWindow).toBe(false);

    const writeAfterGrace = await bAgent.post(`/children/${childId}/journal`).send({ title: "Should be blocked" });
    expect(writeAfterGrace.status).toBe(403);

    // ...but the safety floor still holds even now — proving the two
    // mechanisms are independent.
    const custodyAfterGrace = await bAgent.put(`/children/${childId}/custody-plan`).send(custodyPlanBody(bId));
    expect(custodyAfterGrace.status).toBe(201);
  });

  it("recovering (webhook accepted:true equivalent) clears the grace window", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "payer2@example.com" });
    await agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY" });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: "payer2@example.com" } })).id;

    await prisma.subscription.update({ where: { ownerId: userId }, data: { status: "PAST_DUE", pastDueSince: new Date() } });
    const midFailure = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: userId } });
    expect(midFailure.pastDueSince).not.toBeNull();

    await agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY" });
    const recovered = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: userId } });
    expect(recovered.status).toBe("ACTIVE");
    expect(recovered.pastDueSince).toBeNull();
  });
});
