import { MAX_IMAGE_UPLOAD_BYTES } from "@kinnd/shared";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/quickpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/quickpay")>()),
  getSubscription: vi.fn(async () => ({ id: 4242, accepted: true })),
  chargeRecurring: vi.fn(async () => ({ id: 9001, accepted: true, operations: [{ type: "recurring", qp_status_code: "20000" }] })),
  cancelSubscription: vi.fn(async () => undefined),
}));

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { giveCircle, signupTestUser } from "../testUtils/auth";
import { withRlsBypass } from "../lib/rls";
import * as quickpay from "../lib/quickpay";
import { deleteExpiredSuspendedChildren, endCircle, sendSuspensionNotices } from "../lib/circleLifecycle";
import { renewCircles } from "../lib/billing";
import { archiveAlarm, createAlarm } from "../lib/alarms";

// The subscription model (tasks: subscription model plan), end to end
// through the real routes: Circles, invites by tier (D1, D2, D10), parent
// members (rule 3), downgrade blocking, declined payments and suspension
// (D5), take-over (D4), day-90 deletion under legal hold, coupons, storage
// limits (§5) and the feature gates.

type Agent = Awaited<ReturnType<typeof signupTestUser>>["agent"];
const DAY = 86_400_000;

async function addChild(agent: Agent, firstName: string, relationship = "MOTHER") {
  const res = await agent.post("/children").send({ firstName, gender: "GIRL", birthday: "2019-05-01", relationship });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function invite(agent: Agent, childId: string, relationship: string, email: string) {
  return agent.post("/invites").send({ childId, relationship, email });
}

async function acceptAsMe(agent: Agent, token: string) {
  const res = await agent.post(`/invites/${token}/accept-as-me`);
  expect(res.status).toBe(200);
}

const listed = async (agent: Agent) => ((await agent.get("/children")).body.children as { id: string; tier: string }[]).map((c) => c.id);

describe("Subscription model — the two worked examples", () => {
  beforeEach(resetDb);

  it("a) a co-parent needs a Parent Circle; the co-parent's other child needs his own", async () => {
    const app = createApp();
    const a = await signupTestUser(app, { email: "a@example.com", plan: "SINGLE" });
    const b = await signupTestUser(app, { email: "b@example.com", plan: "SINGLE" });
    const d = await signupTestUser(app, { email: "d@example.com", plan: "SINGLE" });
    const c1 = await addChild(a.agent, "Cleo");

    // D1: a Single can't invite anyone.
    const refused = await invite(a.agent, c1, "FATHER", b.email);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: "PLAN_REQUIRED", details: { requiredTier: "PARENTS" } });

    await giveCircle(a.userId, "PARENTS");
    expect((await a.agent.get(`/children/${c1}`)).body.tier).toBe("PARENTS"); // C1 moved into A's Circle
    await acceptAsMe(b.agent, (await invite(a.agent, c1, "FATHER", b.email)).body.token);

    // B keeps C2 on his free Single; C2 can't go in A's Circle.
    const c2 = await addChild(b.agent, "Carl", "FATHER");
    expect((await b.agent.get(`/children/${c2}`)).body.tier).toBe("FREE");
    expect((await invite(b.agent, c2, "MOTHER", d.email)).status).toBe(403);

    // B starts his own Parent Circle: C2 moves in, and B can invite D.
    await giveCircle(b.userId, "PARENTS");
    expect((await b.agent.get(`/children/${c2}`)).body.tier).toBe("PARENTS");
    await acceptAsMe(d.agent, (await invite(b.agent, c2, "MOTHER", d.email)).body.token);

    expect(await listed(d.agent)).toEqual([c2]);
    expect(await listed(a.agent)).toEqual([c1]);
    expect((await listed(b.agent)).sort()).toEqual([c1, c2].sort());
  });

  it("b) family needs a Family Circle — held by the child's Circle or by the parent who invites (D10)", async () => {
    const app = createApp();
    const a = await signupTestUser(app, { email: "a@example.com", plan: "PARENTS" });
    const b = await signupTestUser(app, { email: "b@example.com", plan: "SINGLE" });
    const gran = await signupTestUser(app, { email: "gran@example.com", plan: "SINGLE" });
    const c1 = await addChild(a.agent, "Cleo");
    await acceptAsMe(b.agent, (await invite(a.agent, c1, "FATHER", b.email)).body.token);

    // A's Parent Circle doesn't allow family, and B (Single) can't either.
    expect((await invite(a.agent, c1, "GRANDMOTHER_PAT", gran.email)).body).toMatchObject({ code: "PLAN_REQUIRED", details: { requiredTier: "FAMILY" } });
    expect((await invite(b.agent, c1, "GRANDMOTHER_PAT", gran.email)).status).toBe(403);

    // B buys a Family Circle: he may invite his mother to C1; she counts under his Circle.
    const bCircle = await giveCircle(b.userId, "FAMILY");
    await acceptAsMe(gran.agent, (await invite(b.agent, c1, "GRANDMOTHER_PAT", gran.email)).body.token);
    expect(await prisma.childAccess.findUnique({ where: { childId_userId: { childId: c1, userId: gran.userId } } })).toMatchObject({
      grantedViaCircleId: bCircle,
    });
    expect(await listed(gran.agent)).toEqual([c1]);

    // B's Circle ends: his mother loses access; A pays nothing and C1 is untouched.
    await endCircle(bCircle);
    expect(await listed(gran.agent)).toEqual([]);
    expect(await listed(a.agent)).toEqual([c1]);
    // B pays again: she's back.
    await giveCircle(b.userId, "FAMILY");
    expect(await listed(gran.agent)).toEqual([c1]);
  });

  it("a grandmother's Family Circle: parents join as members and bring their own children; she can't open them", async () => {
    const app = createApp();
    const g = await signupTestUser(app, { email: "g@example.com", plan: "FAMILY" });
    const p2 = await signupTestUser(app, { email: "p2@example.com", plan: "SINGLE" });
    const res = await g.agent.post("/billing/circle/invites").send({ email: p2.email });
    expect(res.status).toBe(201);
    await acceptAsMe(p2.agent, res.body.token);

    const status = (await p2.agent.get("/billing/status")).body;
    expect(status).toMatchObject({ tier: "FAMILY", circle: { role: "MEMBER", ownerName: expect.any(String) } });
    const kid = await addChild(p2.agent, "Pia");
    expect((await p2.agent.get(`/children/${kid}`)).body.tier).toBe("FAMILY");
    // Paying never gives access: G can't see or open P2's child.
    expect(await listed(g.agent)).toEqual([]);
    expect((await invite(g.agent, kid, "AUNT", "x@example.com")).status).toBe(403);

    // P2 leaves: the child leaves the Circle (to P2's Single, where it fits alone).
    await p2.agent.post("/billing/circle/leave");
    expect((await p2.agent.get(`/children/${kid}`)).body.tier).toBe("FREE");
  });
});

describe("Subscription model — limits and downgrades", () => {
  beforeEach(resetDb);

  it("a Single holds 2 children; a Parent Circle 3", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    await addChild(me.agent, "One");
    await addChild(me.agent, "Two");
    const third = await me.agent.post("/children").send({ firstName: "Three", gender: "BOY", birthday: "2020-01-01", relationship: "MOTHER" });
    expect(third.body).toMatchObject({ code: "CHILD_LIMIT", details: { limit: 2 } });
    await giveCircle(me.userId, "PARENTS");
    await addChild(me.agent, "Three");
    expect((await me.agent.post("/children").send({ firstName: "Four", gender: "BOY", birthday: "2020-01-01", relationship: "MOTHER" })).body.details).toMatchObject({ limit: 3 });
  });

  it("a lower tier can't be picked while what's in use exceeds it, with the reasons", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "FAMILY" });
    const gran = await signupTestUser(app, { plan: "SINGLE" });
    const kid = await addChild(me.agent, "Kit");
    await acceptAsMe(gran.agent, (await invite(me.agent, kid, "GRANDMOTHER_MAT", gran.email)).body.token);

    const down = await me.agent.post("/billing/change").send({ tier: "PARENTS" });
    expect(down.status).toBe(409);
    expect(down.body).toMatchObject({ code: "TIER_UNAVAILABLE", details: { reasons: [{ code: "ROLE", role: "FAMILY" }] } });
    expect((await me.agent.post("/billing/cancel")).body.code).toBe("TIER_UNAVAILABLE");

    const status = (await me.agent.get("/billing/status")).body;
    expect(status.tiers.map((t: { tier: string; available: boolean }) => [t.tier, t.available])).toEqual([
      ["FREE", false],
      ["PARENTS", false],
      ["FAMILY", true],
    ]);
  });

  it("custody planning and the Media Library need a Parent or Family Circle; the data stays", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    const kid = await addChild(me.agent, "Kit");
    const custody = await me.agent.get(`/children/${kid}/custody-plan`);
    expect(custody.status).toBe(403);
    expect(custody.body).toMatchObject({ code: "PLAN_REQUIRED", details: { feature: "custodyPlanning", requiredTier: "PARENTS" } });
    expect((await me.agent.get(`/children/${kid}/moments/media`)).body.code).toBe("PLAN_REQUIRED");
    expect((await me.agent.get("/moments/media")).body).toEqual({ items: [] });

    await giveCircle(me.userId, "PARENTS");
    expect((await me.agent.get(`/children/${kid}/custody-plan`)).status).toBe(200);
    expect((await me.agent.get(`/children/${kid}/moments/media`)).status).toBe(200);
  });

  it("uploads stop at 90% of the storage the tier allows (§5); viewing never does", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    // 460 MB of existing uploads against Single's 500 MB (the block is at 450 MB).
    await withRlsBypass((tx) =>
      tx.mediaAsset.create({ data: { ownerId: me.userId, type: "IMAGE", status: "READY", originalPath: "original/x.jpg", originalBytes: 460 * 1024 * 1024 } })
    );
    const res = await me.agent.post("/media/upload").attach("file", Buffer.from("fake"), { filename: "a.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "STORAGE_FULL", details: { limitBytes: 500 * 1024 * 1024, tier: "FREE" } });
    expect((await me.agent.get("/billing/status")).body.storage).toEqual({ usedBytes: 460 * 1024 * 1024, limitBytes: 500 * 1024 * 1024 });
  });
});

describe("Upload size limits", () => {
  beforeEach(resetDb);

  it("a photo over its limit is refused as too large, not a server error, and nothing is kept", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "FAMILY" });
    const big = Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1024, 1);
    const res = await me.agent.post("/media/upload").attach("file", big, { filename: "big.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("FILE_TOO_LARGE");
    expect(await withRlsBypass((tx) => tx.mediaAsset.count({ where: { ownerId: me.userId } }))).toBe(0);
  });
});

describe("Subscription model — when nobody pays (D5), take-over (D4), deletion and legal hold", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  async function coParented() {
    const app = createApp();
    const a = await signupTestUser(app, { email: "a@example.com", plan: "PARENTS" });
    const b = await signupTestUser(app, { email: "b@example.com", plan: "SINGLE" });
    const c1 = await addChild(a.agent, "Cleo");
    await acceptAsMe(b.agent, (await invite(a.agent, c1, "FATHER", b.email)).body.token);
    const circle = (await prisma.subscription.findUniqueOrThrow({ where: { ownerId: a.userId } })).id;
    return { app, a, b, c1, circle };
  }

  it("a declined renewal ends the Circle at once; a child that doesn't fit Single is hidden for everyone", async () => {
    const { a, b, c1, circle } = await coParented();
    await prisma.subscription.update({
      where: { id: circle },
      data: { quickpaySubscriptionId: "4242", currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    vi.mocked(quickpay.chargeRecurring).mockResolvedValueOnce({ id: 1, accepted: false, operations: [{ type: "recurring", qp_status_code: "40000" }] });
    expect(await renewCircles()).toEqual({ renewed: 0, ended: 1 });

    expect(await listed(a.agent)).toEqual([]);
    expect(await listed(b.agent)).toEqual([]);
    expect((await b.agent.get(`/children/${c1}`)).status).toBe(403);
    const suspended = (await b.agent.get("/children/suspended")).body.children;
    expect(suspended).toMatchObject([{ id: c1, canTakeOver: false }]);
    // Day-0 notice to both parents, email and in-app.
    expect(await prisma.notification.count({ where: { kind: "child.suspended" } })).toBe(2);
  });

  it("the other parent takes the child over into his own Circle, without the payer's consent", async () => {
    const { a, b, c1, circle } = await coParented();
    await endCircle(circle);
    const bCircle = await giveCircle(b.userId, "PARENTS");
    expect((await b.agent.get("/children/suspended")).body.children[0].canTakeOver).toBe(true);
    expect((await b.agent.post(`/children/${c1}/move`).send({ circleId: bCircle })).status).toBe(204);
    expect(await listed(a.agent)).toEqual([c1]);
    expect(await listed(b.agent)).toEqual([c1]);
    expect(await prisma.child.findUniqueOrThrow({ where: { id: c1 } })).toMatchObject({ circleId: bCircle, suspendedAt: null });
  });

  it("warns on days 0, 30 and 83, deletes on day 90 — never while an alarm is active", async () => {
    const { c1, circle } = await coParented();
    const t0 = new Date();
    await endCircle(circle, t0);
    expect((await prisma.child.findUniqueOrThrow({ where: { id: c1 } })).suspensionNotices).toBe(1);
    expect(await sendSuspensionNotices(new Date(t0.getTime() + 10 * DAY))).toBe(0);
    expect(await sendSuspensionNotices(new Date(t0.getTime() + 31 * DAY))).toBe(1);
    expect(await sendSuspensionNotices(new Date(t0.getTime() + 84 * DAY))).toBe(1);

    const day91 = new Date(t0.getTime() + 91 * DAY);
    const alarm = await createAlarm({ childId: c1 }, "Reported for review");
    expect(await deleteExpiredSuspendedChildren(day91)).toEqual({ deleted: 0, held: 1 });
    expect(await prisma.child.findUnique({ where: { id: c1 } })).not.toBeNull();

    await archiveAlarm(alarm.id);
    expect(await deleteExpiredSuspendedChildren(day91)).toEqual({ deleted: 1, held: 0 });
    expect(await prisma.child.findUnique({ where: { id: c1 } })).toBeNull();
  });

  it("a Circle whose use fits Single just drops to Single — nothing is hidden", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "PARENTS" });
    const kid = await addChild(me.agent, "Solo");
    await endCircle((await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } })).id);
    expect(await listed(me.agent)).toEqual([kid]);
    expect((await me.agent.get(`/children/${kid}`)).body.tier).toBe("FREE");
  });
});

describe("Subscription model — coupons", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("a lifetime coupon gives a Circle that never renews; codes are checked", async () => {
    const app = createApp();
    await prisma.coupon.create({ data: { code: "KC-TEST-CODE", tier: "FAMILY", maxRedemptions: 1, note: "test" } });
    const me = await signupTestUser(app, { plan: "SINGLE" });
    const other = await signupTestUser(app, { plan: "SINGLE" });

    expect((await me.agent.post("/billing/coupon").send({ code: "nope" })).body.code).toBe("COUPON_INVALID");
    const redeemed = await me.agent.post("/billing/coupon").send({ code: " kc-test-code " });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body).toMatchObject({ tier: "FAMILY", status: "ACTIVE", lifetime: true, currentPeriodEnd: null });

    expect((await me.agent.post("/billing/coupon").send({ code: "KC-TEST-CODE" })).body.code).toBe("COUPON_ALREADY_REDEEMED");
    expect((await other.agent.post("/billing/coupon").send({ code: "KC-TEST-CODE" })).body.code).toBe("COUPON_USED_UP");

    // Never billed, never ended by the renewal job; can't be cancelled or changed.
    expect(await renewCircles(new Date(Date.now() + 400 * DAY))).toEqual({ renewed: 0, ended: 0 });
    expect(quickpay.chargeRecurring).not.toHaveBeenCalled();
    expect((await me.agent.post("/billing/cancel")).body.code).toBe("LIFETIME_PLAN");
    expect((await me.agent.get("/billing/status")).body.tier).toBe("FAMILY");
  });
});

describe("Subscription model — members", () => {
  beforeEach(resetDb);

  it("either parent removes invited family; the inviter hears about it", async () => {
    const app = createApp();
    const a = await signupTestUser(app, { email: "a@example.com", plan: "PARENTS" });
    const b = await signupTestUser(app, { email: "b@example.com", plan: "FAMILY" });
    const gran = await signupTestUser(app, { email: "gran@example.com", plan: "SINGLE" });
    const c1 = await addChild(a.agent, "Cleo");
    await acceptAsMe(b.agent, (await invite(a.agent, c1, "FATHER", b.email)).body.token);
    await acceptAsMe(gran.agent, (await invite(b.agent, c1, "GRANDMOTHER_PAT", gran.email)).body.token);

    expect((await a.agent.delete(`/children/${c1}/family/${gran.userId}`)).status).toBe(204);
    expect(await listed(gran.agent)).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: b.userId, kind: "access.removed" } })).toBe(1);
    // And the other parent may invite them again straight away (D13).
    expect((await invite(b.agent, c1, "GRANDMOTHER_PAT", gran.email)).status).toBe(201);
    void request;
  });
});
