import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser, verifyTestUserEmail } from "../../testUtils/auth";
import { mailSender, MemoryMailSender } from "../../lib/mailSender";
import { decryptField } from "../../lib/medicalEncryption";

// Phase 9 proof — spec §1.4b/9.9/9.23, brief §5's two flagged open items
// (which relationships may bootstrap-create: decided here as "every
// non-parent RelationshipType"; PENDING_PARENT locking a bootstrap guardian:
// decided here as "no", per spec §2.2b), and D5/D6.
describe("POST /children — bootstrap guardian grant (D5)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a non-parent relationship gets the creator GUARDIAN (not PARENT), with a required parent invite sent", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "grandma@example.com" });

    const res = await agent.post("/children").send({
      firstName: "Emma",
      gender: "GIRL",
      birthday: "2020-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Emma's Mom", email: "emmas-mom@example.com" },
    });
    expect(res.status).toBe(201);
    expect(res.body.parentInvite?.token).toBeTruthy();
    expect(res.body.parentInvite?.emailSent).toBe(true);

    const access = await prisma.childAccess.findUniqueOrThrow({
      where: { childId_userId: { childId: res.body.id, userId: (await prisma.user.findUniqueOrThrow({ where: { email: "grandma@example.com" } })).id } },
    });
    expect(access.role).toBe("GUARDIAN");
    expect(access.relationship).toBe("GRANDMOTHER_MAT");

    const invite = await prisma.invite.findUniqueOrThrow({ where: { token: res.body.parentInvite.token } });
    expect(invite.role).toBe("PARENT");
    expect(invite.relationship).toBe("PARENT");
    expect(invite.email).toBe("emmas-mom@example.com");

    const sender = mailSender as MemoryMailSender;
    const parentInviteEmail = [...sender.sent].reverse().find((m) => m.to === "emmas-mom@example.com");
    expect(parentInviteEmail).toBeTruthy();
  });

  it("a parent-shaped relationship (FATHER/MOTHER/PARENT) still grants PARENT, with no parentContact required", async () => {
    const app = createApp();
    const { agent, userId } = await signupTestUser(app, { email: "dad@example.com" });

    const res = await agent.post("/children").send({ firstName: "Noah", gender: "BOY", birthday: "2021-01-01", relationship: "FATHER" });
    expect(res.status).toBe(201);
    expect(res.body.parentInvite).toBeUndefined();

    const access = await prisma.childAccess.findUniqueOrThrow({ where: { childId_userId: { childId: res.body.id, userId } } });
    expect(access.role).toBe("PARENT");
  });

  it("rejects a bootstrap guardian grant with no parentContact at all", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "uncle@example.com" });
    const res = await agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2019-01-01", relationship: "UNCLE" });
    expect(res.status).toBe(400);
  });

  it("rejects a bootstrap guardian grant with a name but no email, phone, or claim-link opt-in", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "aunt@example.com" });
    const res = await agent.post("/children").send({
      firstName: "Ida",
      gender: "GIRL",
      birthday: "2019-01-01",
      relationship: "AUNT",
      parentContact: { name: "Ida's Dad" },
    });
    expect(res.status).toBe(400);
  });

  it("a claim-link (wantsClaimLink, no email) is created with no email sent", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "caregiver@example.com" });
    const res = await agent.post("/children").send({
      firstName: "Ida",
      gender: "GIRL",
      birthday: "2019-01-01",
      relationship: "CAREGIVER",
      parentContact: { name: "Ida's Mom", wantsClaimLink: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.parentInvite?.token).toBeTruthy();
    expect(res.body.parentInvite?.emailSent).toBe(false);
  });
});

describe("POST /children — 1-child cap (D6: only counts genuine PARENT rows)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a Free-tier user already at their 1-parent cap can still bootstrap-create further children as GUARDIAN", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "grandma2@example.com" });

    // Consume the trial so the FREE 1-child cap is actually in force.
    await prisma.user.updateMany({ data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });

    const ownChild = await agent
      .post("/children")
      .send({ firstName: "OwnKid", gender: "BOY", birthday: "2018-01-01", relationship: "MOTHER" });
    expect(ownChild.status).toBe(201);

    // Cap is now reached for genuine PARENT rows (1/1) — a further PARENT
    // creation would be blocked, but a bootstrap GUARDIAN grant must not be.
    const blockedSecondParentChild = await agent
      .post("/children")
      .send({ firstName: "Blocked", gender: "BOY", birthday: "2018-01-01", relationship: "MOTHER" });
    expect(blockedSecondParentChild.status).toBe(403);

    for (let i = 0; i < 3; i++) {
      const bootstrapRes = await agent.post("/children").send({
        firstName: `Grandkid${i}`,
        gender: "GIRL",
        birthday: "2021-01-01",
        relationship: "GRANDMOTHER_MAT",
        parentContact: { name: `Parent${i}`, wantsClaimLink: true },
      });
      expect(bootstrapRes.status).toBe(201);
    }

    const parentRoleCount = await prisma.childAccess.count({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: "grandma2@example.com" } })).id, role: "PARENT" },
    });
    // Still exactly 1 — the 3 bootstrap grants never counted as PARENT rows.
    expect(parentRoleCount).toBe(1);
  });
});

describe("Claim/merge (spec 9.9)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("accepting a claim-link for a duplicate of a child the acceptor already PARENTs merges access and deletes the duplicate", async () => {
    const app = createApp();

    // The real parent already has "Emma", born 2020-01-01.
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "realparent@example.com" });
    const realEmmaRes = await parentAgent
      .post("/children")
      .send({ firstName: "Emma", gender: "GIRL", birthday: "2020-01-01", relationship: "MOTHER" });
    expect(realEmmaRes.status).toBe(201);
    const realEmmaId = realEmmaRes.body.id;

    // A grandmother, unaware Emma already exists in the app, bootstrap-
    // creates a duplicate "Emma" (same name + birthday) via a claim-link.
    const { agent: grandmaAgent, userId: grandmaId } = await signupTestUser(app, { email: "grandma3@example.com" });
    const dupEmmaRes = await grandmaAgent.post("/children").send({
      firstName: "Emma",
      gender: "GIRL",
      birthday: "2020-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Emma's Mom", wantsClaimLink: true },
    });
    expect(dupEmmaRes.status).toBe(201);
    const dupEmmaId = dupEmmaRes.body.id;
    const claimToken = dupEmmaRes.body.parentInvite.token;
    expect(dupEmmaId).not.toBe(realEmmaId);

    // The real parent (already logged in, already verified) accepts the
    // claim-link as herself — since she already PARENTs a same-name/
    // birthday child, this should merge rather than create a second Emma.
    const acceptRes = await parentAgent.post(`/invites/${claimToken}/accept-as-me`).send({});
    expect(acceptRes.status).toBe(200);

    // The duplicate is gone.
    const dupStillExists = await prisma.child.findUnique({ where: { id: dupEmmaId } });
    expect(dupStillExists).toBeNull();

    // Grandma's GUARDIAN access moved onto the real Emma.
    const grandmaAccessOnReal = await prisma.childAccess.findUnique({
      where: { childId_userId: { childId: realEmmaId, userId: grandmaId } },
    });
    expect(grandmaAccessOnReal?.role).toBe("GUARDIAN");
    expect(grandmaAccessOnReal?.relationship).toBe("GRANDMOTHER_MAT");

    // The real parent's own access is untouched (still PARENT, only one row).
    const parentAccessRows = await prisma.childAccess.findMany({ where: { childId: realEmmaId, userId: parentId } });
    expect(parentAccessRows).toHaveLength(1);
    expect(parentAccessRows[0].role).toBe("PARENT");

    // Grandma now sees only the real Emma (the duplicate is gone from her list too).
    const grandmaChildren = await grandmaAgent.get("/children");
    expect(grandmaChildren.body.children.map((c: { id: string }) => c.id)).toEqual([realEmmaId]);
  });

  it("accepting a claim-link with no pre-existing matching child creates normal access, no merge", async () => {
    const app = createApp();
    const { agent: grandmaAgent } = await signupTestUser(app, { email: "grandma4@example.com" });
    const childRes = await grandmaAgent.post("/children").send({
      firstName: "Liam",
      gender: "BOY",
      birthday: "2022-01-01",
      relationship: "GRANDFATHER_PAT",
      parentContact: { name: "Liam's Dad", wantsClaimLink: true },
    });
    const claimToken = childRes.body.parentInvite.token;

    const { agent: dadAgent, userId: dadId } = await signupTestUser(app, { email: "liamsdad@example.com" });
    const acceptRes = await dadAgent.post(`/invites/${claimToken}/accept-as-me`).send({});
    expect(acceptRes.status).toBe(200);

    const access = await prisma.childAccess.findUniqueOrThrow({
      where: { childId_userId: { childId: childRes.body.id, userId: dadId } },
    });
    expect(access.role).toBe("PARENT");

    const stillOneChild = await prisma.child.count();
    expect(stillOneChild).toBe(1);
  });

  // Post-launch backlog Phase A — mergeChildAccessInto used to move
  // ChildAccess only; everything else authored on the duplicate (journal,
  // medical, custody plan, avatar) was lost to cascade delete. Also proves
  // the fix for a latent FK-constraint bug: MediaAsset.avatarForChildId has
  // no onDelete clause, so a duplicate with an avatar set would have thrown
  // on tx.child.delete() before this fix.
  it("claim/merge moves the duplicate's content (journal, medical, custody plan) onto the real child, not just access", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "content-parent@example.com" });
    const realRes = await parentAgent
      .post("/children")
      .send({ firstName: "Nora", gender: "GIRL", birthday: "2021-03-01", relationship: "MOTHER" });
    const realId = realRes.body.id;

    const { agent: grandmaAgent, userId: grandmaId } = await signupTestUser(app, { email: "content-grandma@example.com" });
    const dupRes = await grandmaAgent.post("/children").send({
      firstName: "Nora",
      gender: "GIRL",
      birthday: "2021-03-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Nora's Mom", wantsClaimLink: true },
    });
    const dupId = dupRes.body.id;
    const claimToken = dupRes.body.parentInvite.token;

    // Real content on the duplicate, authored by grandma (a genuine
    // GUARDIAN, so this is exactly what a real pre-merge duplicate would
    // have accumulated), plus a fabricated avatar row — fabricated directly
    // since exercising the real multipart upload isn't what this test is
    // proving.
    const journalRes = await grandmaAgent.post(`/children/${dupId}/journal`).send({ title: "First smile" });
    expect(journalRes.status).toBe(201);
    const medicalRes = await grandmaAgent.post(`/children/${dupId}/medical-info`).send({ category: "ALLERGY", condition: "Peanuts" });
    expect(medicalRes.status).toBe(201);
    const custodyRes = await grandmaAgent.put(`/children/${dupId}/custody-plan`).send({
      label: "Week on/week off",
      startDate: "2026-01-01",
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: grandmaId, days: 7 }] },
    });
    expect(custodyRes.status).toBe(201);
    const avatarAsset = await prisma.mediaAsset.create({
      data: { ownerId: grandmaId, type: "IMAGE", status: "READY", originalPath: "x", avatarForChildId: dupId },
    });

    const acceptRes = await parentAgent.post(`/invites/${claimToken}/accept-as-me`).send({});
    expect(acceptRes.status).toBe(200);

    // The merge succeeded at all (didn't throw on the avatar FK).
    expect(await prisma.child.findUnique({ where: { id: dupId } })).toBeNull();

    const journalOnReal = await prisma.journalPostChild.findMany({ where: { childId: realId } });
    expect(journalOnReal).toHaveLength(1);
    // Post-launch backlog Phase G landed after this test was first written —
    // condition is now stored encrypted, so decrypt before asserting on it.
    const medicalOnReal = await prisma.medicalInfo.findMany({ where: { childId: realId } });
    expect(medicalOnReal).toHaveLength(1);
    expect(decryptField(medicalOnReal[0].condition)).toBe("Peanuts");
    const custodyOnReal = await prisma.custodyPlan.findMany({ where: { childId: realId } });
    expect(custodyOnReal).toHaveLength(1);

    // The duplicate's avatar reference was cleared, not carried over onto
    // the real child (the real child keeps whatever avatar it already has).
    const avatarAfter = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: avatarAsset.id } });
    expect(avatarAfter.avatarForChildId).toBeNull();

    void parentId;
  });
});

describe("Scenario 3 (full, Phase 9) — grandmother bootstrap-creates children she has no legal claim to", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("her trial covers her bootstrap grants; a normal PARENT invite is refused to her; a solo bootstrap child stays satisfied at FREE tier even after her trial lapses", async () => {
    const app = createApp();
    const { agent: grandmaAgent, userId: grandmaId } = await signupTestUser(app, { email: "grandma5@example.com" });

    const childRes = await grandmaAgent.post("/children").send({
      firstName: "Zoe",
      gender: "GIRL",
      birthday: "2023-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Zoe's Mom", wantsClaimLink: true },
    });
    expect(childRes.status).toBe(201);
    const childId = childRes.body.id;

    // Within her own 30-day trial: a GUARDIAN write succeeds (her trial
    // satisfies the child, since she's its only covering member).
    const writeWithinTrial = await grandmaAgent.post(`/children/${childId}/journal`).send({ title: "First photo" });
    expect(writeWithinTrial.status).toBe(201);

    // GUARDIAN cannot invite a PARENT directly (member:invite_or_remove_parent
    // is PARENT-only) — she can only use the parent-contact/claim-link path
    // that child-creation already set up for her.
    const directParentInvite = await grandmaAgent
      .post("/invites")
      .send({ childId, relationship: "MOTHER", email: "someone@example.com" });
    expect(directParentInvite.status).toBe(403);

    // Her one-time trial lapses. No parent has ever joined — she remains the
    // child's ONLY member, so requiredTier is evaluated from her own
    // perspective with nobody else on the child (def. 3's 9.18 carve-out:
    // a lone GUARDIAN never needs paid tier for herself) and comes out FREE,
    // same as it would for a lone organic PARENT on their one child (spec
    // §4.1's Free-tier promise: 1 child, full read/write, always). Her
    // now-FREE subscription trivially meets that FREE bar, so she is NOT
    // locked out — the abuse case this seems to invite (bootstrap-creating
    // many such solo children for free) is deliberately NOT closed by
    // entitlement lapsing here; it's closed by Phase 10's soft fair-use cap
    // (9.10, 10 children/15 members) instead, tested separately there.
    await prisma.user.update({ where: { id: grandmaId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

    const writeAfterLapse = await grandmaAgent.post(`/children/${childId}/journal`).send({ title: "Still fine, solo child" });
    expect(writeAfterLapse.status).toBe(201);

    const custodyWriteAfterLapse = await grandmaAgent.put(`/children/${childId}/custody-plan`).send({
      label: "Any schedule",
      startDate: "2026-01-01",
      patternDays: { cycleLengthDays: 7, blocks: [{ userId: grandmaId, days: 7 }] },
    });
    expect(custodyWriteAfterLapse.status).toBe(201);
  });
});
