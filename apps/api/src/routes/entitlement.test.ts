import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser, verifyInvitedTestUser } from "../testUtils/auth";

// Small helper: accept a brand-new invite, verify the resulting account's
// email (POST /children and POST /invites both require it — an invite
// accept does NOT auto-verify, same as an organic signup), and return the
// agent + userId. Every scenario below needs several of these.
async function acceptInvite(
  app: ReturnType<typeof createApp>,
  token: string,
  email: string,
  firstName: string,
  lastName: string
) {
  const agent = request.agent(app);
  const res = await agent.post(`/invites/${token}/accept`).send({ firstName, lastName, password: "password123" });
  expect(res.status).toBe(200);
  await verifyInvitedTestUser(agent, email);
  return { agent, userId: res.body.user.id as string };
}

// Phase 7 proof — spec §3's three scenarios, run as literal integration
// tests. "If any of these three don't pass as written, the entitlement
// engine is wrong, no matter what the unit tests say" (roles/subscription
// build brief, Phase 7).
describe("Entitlement engine — spec §3 scenarios", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("Scenario 1 — co-parent has a second child elsewhere", async () => {
    const app = createApp();

    // "I buy Parents, invite co-parent to Emma."
    const { agent: meAgent } = await signupTestUser(app, { email: "me@example.com" });
    const subscribeRes = await meAgent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    expect(subscribeRes.status).toBe(200);

    const emmaRes = await meAgent
      .post("/children")
      .send({ firstName: "Emma", gender: "GIRL", birthday: "2020-01-01", relationship: "PARENT" });
    expect(emmaRes.status).toBe(201);
    const emmaId = emmaRes.body.id;

    const inviteRes = await meAgent.post("/invites").send({ childId: emmaId, relationship: "PARENT", email: "co-parent@example.com" });
    expect(inviteRes.status).toBe(201);
    const { agent: coParentAgent, userId: coParentId } = await acceptInvite(
      app,
      inviteRes.body.token,
      "co-parent@example.com",
      "Co",
      "Parent"
    );

    // "Emma requiredTier = PARENTS, covered by my plan, satisfied. Co-parent
    // writes freely, forever, pays nothing."
    const emmaWrite1 = await coParentAgent.post(`/children/${emmaId}/moments`).send({ title: "From co-parent" });
    expect(emmaWrite1.status).toBe(201);

    // "Co-parent creates Noah (her child with someone else) — a new,
    // uncovered child. Her own one-time 30-day trial satisfies him."
    const noahRes = await coParentAgent
      .post("/children")
      .send({ firstName: "Noah", gender: "BOY", birthday: "2022-01-01", relationship: "MOTHER" });
    expect(noahRes.status).toBe(201);
    const noahId = noahRes.body.id;

    // "She invites Noah's other parent — Noah requiredTier = PARENTS; still
    // inside her trial."
    const noahInviteRes = await coParentAgent
      .post("/invites")
      .send({ childId: noahId, relationship: "FATHER", email: "noahs-dad@example.com" });
    expect(noahInviteRes.status).toBe(201);
    const { agent: noahsDadAgent, userId: noahsDadId } = await acceptInvite(
      app,
      noahInviteRes.body.token,
      "noahs-dad@example.com",
      "Noah's",
      "Dad"
    );
    void noahsDadAgent;

    // Noah now needs PARENTS tier (2 adults) — co-parent's own subscription
    // is FREE, but she's still within her trial, which covers it.
    const noahWriteWithinTrial = await coParentAgent.post(`/children/${noahId}/moments`).send({ title: "Noah update" });
    expect(noahWriteWithinTrial.status).toBe(201);

    // "Day 31 — Emma stays satisfied by my plan (her access to Emma is
    // never interrupted). Noah becomes unsatisfied -> blocked, scoped to
    // Noah only." Both of Noah's parents' own trials lapse together (they
    // joined around the same time in this narrative) — Noah has no paid
    // subscription behind him at all once neither trial covers him.
    await prisma.user.updateMany({
      where: { id: { in: [coParentId, noahsDadId] } },
      data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const emmaWriteAfterDay31 = await coParentAgent.post(`/children/${emmaId}/moments`).send({ title: "Still fine" });
    expect(emmaWriteAfterDay31.status).toBe(201);

    const noahWriteAfterDay31 = await coParentAgent.post(`/children/${noahId}/moments`).send({ title: "Should be blocked" });
    expect(noahWriteAfterDay31.status).toBe(403);

    // Invariant: reads never gate on billing (brief §1). Proven here, not
    // just read from requireChildEntitlement's early GET return — the exact
    // same now-unsatisfied Noah whose write just got a 403 above still
    // serves every read normally.
    const noahReadAfterDay31 = await coParentAgent.get(`/children/${noahId}/moments`);
    expect(noahReadAfterDay31.status).toBe(200);
    const noahDetailAfterDay31 = await coParentAgent.get(`/children/${noahId}`);
    expect(noahDetailAfterDay31.status).toBe(200);
  });

  it("Scenario 2 — adding a grandmother raises requiredTier to FAMILY the same way regardless of who invites her (R2/§2.3)", async () => {
    for (const inviterIsOriginalParent of [true, false]) {
      await resetDb();
      const app = createApp();

      const { agent: parentAgent } = await signupTestUser(app, { email: "parent@example.com" });
      const sub1 = await parentAgent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
      expect(sub1.status).toBe(200);
      const childRes = await parentAgent
        .post("/children")
        .send({ firstName: "Emma", gender: "GIRL", birthday: "2020-01-01", relationship: "PARENT" });
      expect(childRes.status).toBe(201);
      const childId = childRes.body.id;

      const coParentInviteRes = await parentAgent
        .post("/invites")
        .send({ childId, relationship: "PARENT", email: "co-parent@example.com" });
      expect(coParentInviteRes.status).toBe(201);
      const { agent: coParentAgent } = await acceptInvite(app, coParentInviteRes.body.token, "co-parent@example.com", "Co", "Parent");

      // Two adults, requiredTier=PARENTS, satisfied by the original parent's
      // plan — both can write freely.
      const beforeGrandma = await coParentAgent.post(`/children/${childId}/moments`).send({ title: "Before" });
      expect(beforeGrandma.status).toBe(201);

      // Either the original parent or the co-parent invites the grandmother
      // — the inviter shouldn't matter to the resulting requiredTier.
      const invitingAgent = inviterIsOriginalParent ? parentAgent : coParentAgent;
      const grandmaInviteRes = await invitingAgent
        .post("/invites")
        .send({ childId, relationship: "GRANDMOTHER_MAT", email: "grandma@example.com" });
      expect(grandmaInviteRes.status).toBe(201);
      await acceptInvite(app, grandmaInviteRes.body.token, "grandma@example.com", "Grandma", "G");

      // Fast-forward past everyone's trial so only real subscription tiers
      // count — the original parent's plan is PARENTS, not FAMILY.
      await prisma.user.updateMany({
        data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      // requiredTier is now FAMILY (a FAMILY-role member exists) regardless
      // of who sent the invite — nobody's plan meets that bar, so the child
      // is unsatisfied for both paths identically.
      const afterGrandma = await coParentAgent.post(`/children/${childId}/moments`).send({ title: "After" });
      expect(afterGrandma.status).toBe(403);

      // Upgrading to Family (whoever does it) resolves it for everyone.
      const upgradeRes = await parentAgent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
      expect(upgradeRes.status).toBe(200);
      const afterUpgrade = await coParentAgent.post(`/children/${childId}/moments`).send({ title: "After upgrade" });
      expect(afterUpgrade.status).toBe(201);
    }
  });

  it("Scenario 3 (partial — bootstrap-creator half deferred to Phase 9) — a sponsored FAMILY member never covers the child she's sponsored on", async () => {
    const app = createApp();

    const { agent: parentAgent } = await signupTestUser(app, { email: "parent3@example.com" });
    const sub = await parentAgent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    expect(sub.status).toBe(200);
    const emmaRes = await parentAgent
      .post("/children")
      .send({ firstName: "Emma", gender: "GIRL", birthday: "2020-01-01", relationship: "PARENT" });
    expect(emmaRes.status).toBe(201);
    const emmaId = emmaRes.body.id;

    const grandmaInviteRes = await parentAgent
      .post("/invites")
      .send({ childId: emmaId, relationship: "GRANDMOTHER_MAT", email: "grandma3@example.com" });
    expect(grandmaInviteRes.status).toBe(201);
    const { agent: grandmaAgent, userId: grandmaId } = await acceptInvite(
      app,
      grandmaInviteRes.body.token,
      "grandma3@example.com",
      "Grandma",
      "Three"
    );

    // Grandma has FAMILY access to Emma — full use of the app, but per
    // Consequence 1 (spec §2.2) her own subscription never covers Emma,
    // even if she later buys Family for herself (which she hasn't here —
    // she's FREE/trialing). Emma's coverage is untouched by anything about
    // grandma's own plan; it comes entirely from the original parent.
    const grandmaWrite = await grandmaAgent.post(`/children/${emmaId}/moments`).send({ title: "From grandma" });
    expect(grandmaWrite.status).toBe(201); // full app access — moments:post is FAMILY-role allowed

    // Even after grandma's own trial lapses, Emma stays satisfied — her
    // trial/subscription state was never what covered Emma in the first
    // place (the original parent's Family plan is).
    await prisma.user.update({ where: { id: grandmaId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const grandmaWriteAfterTrial = await grandmaAgent.post(`/children/${emmaId}/moments`).send({ title: "Still fine" });
    expect(grandmaWriteAfterTrial.status).toBe(201);

    // NOTE: "she creates 5 grandchildren and gets GUARDIAN (bootstrap, not
    // placement), her own trial covers them" is the other half of Scenario
    // 3 — deliberately not tested here. D5 isn't fixed until Phase 9:
    // today, POST /children always grants the creator role PARENT
    // regardless of who they are, so a grandmother creating a child here
    // would (incorrectly, pre-Phase-9) become a PARENT, not a bootstrap
    // GUARDIAN — testing that behavior now would either assert the
    // pre-Phase-9 bug as if it were correct, or fake a result. Phase 9's
    // own proof section covers this properly once the fix lands.
  });
});
