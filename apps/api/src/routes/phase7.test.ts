import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/quickpay", () => ({
  createSubscription: vi.fn(async () => ({ id: 4242 })),
  getSubscriptionLink: vi.fn(async () => ({ url: "https://payment.quickpay.net/subscriptions/test" })),
  getSubscription: vi.fn(async () => ({ id: 4242, accepted: true })),
  chargeRecurring: vi.fn(async () => ({ id: 9001 })),
  getPayment: vi.fn(),
  verifyWebhookSignature: vi.fn(() => true),
}));

import { createApp } from "../app";
import { config } from "../config";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRlsBypass } from "../lib/rls";
import * as quickpay from "../lib/quickpay";
import { firstChargeOrderId } from "../lib/billingActivation";

// v3.0 Phase 7: account deletion keeps the family's history under "Former
// member"; checkout records the withdrawal consent, charges the first
// period exactly once, and follows QuickPay's payment callbacks.

async function family() {
  const app = createApp();
  const mom = await signupTestUser(app, { firstName: "Mia" });
  const leo = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2015-07-31", relationship: "MOTHER" })).body.id as string;
  const dad = await signupTestUser(app, { firstName: "Dan" });
  await prisma.childAccess.create({ data: { childId: leo, userId: dad.userId, role: "PARENT", relationship: "FATHER" } });
  const gran = await signupTestUser(app, { firstName: "Inger" });
  await prisma.childAccess.create({ data: { childId: leo, userId: gran.userId, role: "FAMILY", relationship: "GRANDMOTHER_MAT" } });
  return { app, leo, mom, dad, gran };
}

describe("Account deletion", () => {
  beforeEach(resetDb);

  it("needs an explicit confirmation", async () => {
    const { dad } = await family();
    const res = await dad.agent.delete("/auth/me").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CONFIRM_REQUIRED");
  });

  it("anonymises the account and keeps what it shared as 'Former member'", async () => {
    const { app, leo, mom, dad } = await family();
    const moment = (await dad.agent.post(`/children/${leo}/moments`).send({ title: "Home run" })).body;
    await dad.agent.post(`/children/${leo}/moments/${moment.id}/comments`).send({ text: "Proud!" });
    const thread = (await dad.agent.post("/messages/threads").send({ memberUserIds: [mom.userId] })).body.id;
    await dad.agent.post(`/messages/threads/${thread}/messages`).send({ text: "Pick-up at 3" });

    const res = await dad.agent.delete("/auth/me").send({ confirm: true });
    expect(res.status).toBe(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: dad.userId } });
    expect(row).toMatchObject({ firstName: "Former member", lastName: "", phone: null, passwordHash: null, avatarUrl: null });
    expect(row.email).toMatch(/@kidcom\.invalid$/);
    expect(row.deletedAt).not.toBeNull();
    expect(await prisma.childAccess.count({ where: { userId: dad.userId } })).toBe(0);

    // The history stays, attributed to "Former member".
    const post = await mom.agent.get(`/children/${leo}/moments/${moment.id}`);
    expect(post.status).toBe(200);
    expect(post.body.authorName).toBe("Former member");
    const messages = await mom.agent.get(`/messages/threads/${thread}/messages`);
    expect(messages.body.items[0]).toMatchObject({ text: "Pick-up at 3", senderName: "Former member" });
    const circle = await mom.agent.get(`/children/${leo}/family`);
    expect(circle.body.members.map((m: { userId: string }) => m.userId)).not.toContain(dad.userId);

    // The old session is gone and nothing signs in any more.
    expect((await dad.agent.get("/auth/me")).body.user ?? null).toBeNull();
    expect((await request(app).post("/auth/login").send({ email: dad.email, password: "password123" })).status).not.toBe(202);
  });

  it("is refused for the last parent of a child others still follow, naming the child", async () => {
    const { leo, dad, mom } = await family();
    await dad.agent.delete("/auth/me").send({ confirm: true }); // one parent leaves — fine
    const res = await mom.agent.delete("/auth/me").send({ confirm: true }); // grandma would be left alone
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "LAST_GUARDIAN", details: { children: [{ childId: leo, firstName: "Leo" }] } });
  });

  it("a child nobody else follows is soft-deleted with the account", async () => {
    const app = createApp();
    const solo = await signupTestUser(app, { firstName: "Sol" });
    const kid = (await solo.agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2022-01-01", relationship: "MOTHER" })).body.id as string;
    expect((await solo.agent.delete("/auth/me").send({ confirm: true })).status).toBe(204);
    const child = await withRlsBypass((tx) => tx.child.findUniqueOrThrow({ where: { id: kid } }));
    expect(child.deletedAt).not.toBeNull();
  });
});

describe("Sessions", () => {
  beforeEach(resetDb);

  it("counts other signed-in devices and signs them out", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    expect((await me.agent.get("/auth/sessions")).body).toEqual({ otherSessions: 0 });
    expect((await me.agent.post("/auth/sessions/revoke-others")).body).toEqual({ revoked: 0 });
    expect((await me.agent.get("/auth/me")).status).toBe(200); // this device stays signed in
  });
});

describe("Checkout", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    config.quickpayApiKey = "test-key";
  });

  it("requires the withdrawal consent for a paid plan and records it", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    const refused = await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY" });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("WITHDRAWAL_CONSENT_REQUIRED");

    const ok = await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    expect(ok.body.redirectUrl).toBe("https://payment.quickpay.net/subscriptions/test");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } });
    expect(sub).toMatchObject({ status: "PENDING", quickpaySubscriptionId: "4242" });
    expect(sub.withdrawalConsentAt).not.toBeNull();
  });

  it("charges the first period once, whether the app or the callback confirms first", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    await me.agent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "ANNUAL", acceptWithdrawalWaiver: true });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } });

    const confirmed = await me.agent.post("/billing/confirm");
    expect(confirmed.body).toMatchObject({ tier: "FAMILY", status: "ACTIVE", billingPeriod: "ANNUAL" });
    expect(quickpay.chargeRecurring).toHaveBeenCalledTimes(1);
    expect(quickpay.chargeRecurring).toHaveBeenCalledWith({ subscriptionId: 4242, amountMinorUnits: 55900, orderId: firstChargeOrderId(sub.id, "4242") });

    // The callback arriving afterwards, and a second confirm, charge nothing more.
    await request(app).post("/billing/webhook").set("QuickPay-Checksum-Sha256", "x").send({ id: 4242, type: "Subscription", accepted: true });
    await me.agent.post("/billing/confirm");
    expect(quickpay.chargeRecurring).toHaveBeenCalledTimes(1);
  });

  it("stays pending while the card isn't authorised", async () => {
    vi.mocked(quickpay.getSubscription).mockResolvedValueOnce({ id: 4242, accepted: false });
    const app = createApp();
    const me = await signupTestUser(app);
    await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    expect((await me.agent.post("/billing/confirm")).body.status).toBe("PENDING");
    expect(quickpay.chargeRecurring).not.toHaveBeenCalled();
  });

  it("a declined charge callback puts the plan past due; a later accepted one recovers it", async () => {
    const app = createApp();
    const me = await signupTestUser(app);
    await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    await me.agent.post("/billing/confirm");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } });

    await request(app).post("/billing/webhook").set("QuickPay-Checksum-Sha256", "x").send({ id: 9001, type: "Payment", accepted: false, order_id: sub.lastChargeOrderId });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("PAST_DUE");
    await request(app).post("/billing/webhook").set("QuickPay-Checksum-Sha256", "x").send({ id: 9001, type: "Payment", accepted: true, order_id: sub.lastChargeOrderId });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("ACTIVE");
  });

  it("lists the plans with prices from the server", async () => {
    const res = await request(createApp()).get("/billing/plans");
    expect(res.body.plans).toEqual([
      { tier: "PARENTS", prices: { MONTHLY: 2900, ANNUAL: 27500 } },
      { tier: "FAMILY", prices: { MONTHLY: 5900, ANNUAL: 55900 } },
    ]);
  });
});
