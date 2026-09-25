import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/quickpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/quickpay")>()),
  createSubscription: vi.fn(async () => ({ id: 4242 })),
  getSubscriptionLink: vi.fn(async () => ({ url: "https://payment.quickpay.net/subscriptions/test" })),
  getSubscription: vi.fn(async () => ({ id: 4242, accepted: true })),
  chargeRecurring: vi.fn(async () => ({ id: 9001, accepted: true, operations: [{ type: "recurring", qp_status_code: "20000" }] })),
  findPaymentsByOrderId: vi.fn(async () => []),
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
    expect(row.email).toMatch(/@kinnd\.invalid$/);
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

  it("is refused for the only parent of a child, even with nobody else following it", async () => {
    const app = createApp();
    const solo = await signupTestUser(app, { firstName: "Sol" });
    const kid = (await solo.agent.post("/children").send({ firstName: "Ida", gender: "GIRL", birthday: "2022-01-01", relationship: "MOTHER" })).body.id as string;
    const res = await solo.agent.delete("/auth/me").send({ confirm: true });
    expect(res.status).toBe(409);
    expect(res.body.details.children).toEqual([{ childId: kid, firstName: "Ida" }]);
    const child = await withRlsBypass((tx) => tx.child.findUniqueOrThrow({ where: { id: kid } }));
    expect(child.deletedAt).toBeNull();
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
  const single = (app: ReturnType<typeof createApp>) => signupTestUser(app, { plan: "SINGLE" });
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    config.quickpayApiKey = "test-key";
  });

  it("requires the withdrawal consent for a paid plan and records it", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
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
    const me = await single(app);
    await me.agent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "ANNUAL", acceptWithdrawalWaiver: true });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } });

    const confirmed = await me.agent.post("/billing/confirm");
    expect(confirmed.body).toMatchObject({ tier: "FAMILY", status: "ACTIVE", billingPeriod: "ANNUAL" });
    expect(quickpay.chargeRecurring).toHaveBeenCalledTimes(1);
    expect(quickpay.chargeRecurring).toHaveBeenCalledWith({ subscriptionId: 4242, amountMinorUnits: 62100, orderId: firstChargeOrderId(sub.id, "4242") });

    // The callback arriving afterwards, and a second confirm, charge nothing more.
    await request(app).post("/billing/webhook").set("QuickPay-Checksum-Sha256", "x").send({ id: 4242, type: "Subscription", accepted: true });
    await me.agent.post("/billing/confirm");
    expect(quickpay.chargeRecurring).toHaveBeenCalledTimes(1);
  });

  it("stays pending while the card isn't authorised", async () => {
    vi.mocked(quickpay.getSubscription).mockResolvedValueOnce({ id: 4242, accepted: false });
    const app = createApp();
    const me = await single(app);
    await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    expect((await me.agent.post("/billing/confirm")).body.status).toBe("PENDING");
    expect(quickpay.chargeRecurring).not.toHaveBeenCalled();
  });

  it("a declined first charge answers with QuickPay's status code only, and leaves the plan on Free", async () => {
    vi.mocked(quickpay.chargeRecurring).mockResolvedValueOnce({ id: 9002, accepted: false, operations: [{ type: "recurring", qp_status_code: "40000" }] });
    const app = createApp();
    const me = await single(app);
    await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });

    const res = await me.agent.post("/billing/confirm");
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: "PAYMENT_DECLINED", details: { qpStatusCode: "40000" } });
    expect(await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } })).toMatchObject({ tier: "FREE", status: "ACTIVE", quickpaySubscriptionId: null });
  });

  it("losing the race to charge goes by how the winner's payment went", async () => {
    vi.mocked(quickpay.chargeRecurring).mockRejectedValueOnce(new quickpay.QuickPayError(409, '{"message":"order_id already exists"}', null));
    vi.mocked(quickpay.findPaymentsByOrderId).mockResolvedValueOnce([{ id: 9003, accepted: false, operations: [{ type: "recurring", qp_status_code: "40001" }] }]);
    const app = createApp();
    const me = await single(app);
    await me.agent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });

    const res = await me.agent.post("/billing/confirm");
    expect(res.status).toBe(402);
    expect(res.body.details).toEqual({ qpStatusCode: "40001" });
  });

  it("never passes QuickPay's own error text to the app", async () => {
    vi.mocked(quickpay.createSubscription).mockRejectedValueOnce(new quickpay.QuickPayError(400, '{"message":"Validation error","errors":{"currency":["internal detail"]}}', "30100"));
    const app = createApp();
    const me = await single(app);
    const res = await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: "PAYMENT_PROVIDER_ERROR", details: { qpStatusCode: "30100" } });
    expect(JSON.stringify(res.body)).not.toMatch(/Validation error|internal detail/);
  });

  it("a declined charge callback ends the Circle at once (declined is declined)", async () => {
    const app = createApp();
    const me = await single(app);
    await me.agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    await me.agent.post("/billing/confirm");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } });

    expect(sub).toMatchObject({ tier: "PARENTS", status: "ACTIVE" });
    await request(app).post("/billing/webhook").set("QuickPay-Checksum-Sha256", "x").send({ id: 9001, type: "Payment", accepted: false, order_id: sub.lastChargeOrderId });
    // Nothing in use needs a paid plan, so it simply drops to Single (D5).
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).toMatchObject({ tier: "FREE", status: "ACTIVE" });
    expect(await prisma.notification.count({ where: { userId: me.userId, kind: "payment.failed" } })).toBe(1);
  });

  it("lists the plans with prices from the server", async () => {
    const res = await request(createApp()).get("/billing/plans");
    expect(res.body.plans.map((p: { tier: string; prices: unknown }) => [p.tier, p.prices])).toEqual([
      ["FREE", null],
      ["PARENTS", { MONTHLY: 3900, ANNUAL: 35100 }],
      ["FAMILY", { MONTHLY: 6900, ANNUAL: 62100 }],
    ]);
    expect(res.body.trialDays).toBe(30);
    expect(res.body.plans[1].limits).toMatchObject({ children: 3, invitableRoles: ["PARENT", "GUARDIAN"] });
  });
});

describe("Test cards in production", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    config.quickpayApiKey = "test-key";
  });

  it("a test-card authorisation doesn't buy a plan unless test cards are allowed", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    vi.mocked(quickpay.getSubscription).mockResolvedValueOnce({ id: 4242, accepted: true, test_mode: true });
    config.quickpayAcceptTestCards = false;
    try {
      await me.agent.post("/billing/checkout").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
      const res = await me.agent.post("/billing/confirm");
      expect(res.status).toBe(402);
      expect(quickpay.chargeRecurring).not.toHaveBeenCalled();
      expect(await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } })).toMatchObject({ tier: "FREE", quickpaySubscriptionId: null });
    } finally {
      config.quickpayAcceptTestCards = true;
    }
  });
});

describe("Trial (D3: no card at signup)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    config.quickpayApiKey = "test-key";
  });

  it("starts without a card, records a card without charging, and charges when the trial ends", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    const started = await me.agent.post("/billing/trial").send({ tier: "PARENTS" });
    expect(started.body).toMatchObject({ tier: "PARENTS", status: "TRIALING", trialAvailable: false, cardOnFile: false });
    expect(started.body.trialEndsAt).not.toBeNull();

    // Adding a card during the trial: QuickPay payment window, nothing charged yet.
    await me.agent.post("/billing/checkout").send({ tier: "PARENTS", billingPeriod: "MONTHLY", acceptWithdrawalWaiver: true });
    const confirmed = await me.agent.post("/billing/confirm");
    expect(confirmed.body).toMatchObject({ status: "TRIALING", cardOnFile: true });
    expect(quickpay.chargeRecurring).not.toHaveBeenCalled();

    const { finishTrials } = await import("../lib/billing");
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(await finishTrials(later)).toEqual({ charged: 1, ended: 0 });
    expect(quickpay.chargeRecurring).toHaveBeenCalledTimes(1);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { ownerId: me.userId } })).toMatchObject({ tier: "PARENTS", status: "ACTIVE" });
  });

  it("one trial per person, ever", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    await me.agent.post("/billing/trial").send({ tier: "FAMILY" });
    await me.agent.post("/billing/cancel");
    const again = await me.agent.post("/billing/trial").send({ tier: "FAMILY" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("TRIAL_USED");
  });

  it("without a card, the trial ends by dropping to Single when the use fits", async () => {
    const app = createApp();
    const me = await signupTestUser(app, { plan: "SINGLE" });
    await me.agent.post("/billing/trial").send({ tier: "FAMILY" });
    const { finishTrials } = await import("../lib/billing");
    expect(await finishTrials(new Date(Date.now() + 31 * 86_400_000))).toEqual({ charged: 0, ended: 1 });
    expect((await me.agent.get("/billing/status")).body).toMatchObject({ tier: "FREE", circle: null });
  });
});
