import { describe, it, expect, beforeEach, vi } from "vitest";

import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { createApp } from "../app";
import * as quickpay from "./quickpay";
import { reconcilePendingSubscriptions, RECONCILE_AFTER_MS } from "./billingReconciliation";

// Post-launch backlog Phase E proof — D7: an abandoned QuickPay checkout no
// longer sits at tier:PARENTS/FAMILY, status:PENDING forever. Mocks
// quickpay.getSubscription rather than hitting the real QuickPay API — same
// reasoning as the existing grace-period/coverage tests (safetyFloor.test.ts)
// simulating the webhook's DB effects directly instead of fighting
// checksum verification with no test credentials configured.
describe("reconcilePendingSubscriptions (spec-adjacent, D7)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  async function pendingSubscriptionFor(email: string) {
    const app = createApp();
    const { userId } = await signupTestUser(app, { email });
    const sub = await prisma.subscription.upsert({
      where: { ownerId: userId },
      update: {
        tier: "FAMILY",
        status: "PENDING",
        billingPeriod: "MONTHLY",
        quickpaySubscriptionId: "12345",
      },
      create: {
        ownerId: userId,
        tier: "FAMILY",
        status: "PENDING",
        billingPeriod: "MONTHLY",
        quickpaySubscriptionId: "12345",
      },
    });
    return { userId, subscriptionId: sub.id };
  }

  it("reverts a genuinely abandoned checkout to FREE/ACTIVE, not leaving a dead PENDING row", async () => {
    const { subscriptionId } = await pendingSubscriptionFor("reconcile-abandoned@example.com");
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { updatedAt: new Date(Date.now() - RECONCILE_AFTER_MS - 1000) } });

    vi.spyOn(quickpay, "getSubscription").mockResolvedValue({ id: 12345, accepted: false });

    const result = await reconcilePendingSubscriptions();
    expect(result.reverted).toBe(1);
    expect(result.healed).toBe(0);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(after.tier).toBe("FREE");
    expect(after.status).toBe("ACTIVE");
    expect(after.quickpaySubscriptionId).toBeNull();
  });

  it("self-heals to ACTIVE when QuickPay actually confirms it (a missed webhook), not a real abandonment", async () => {
    const { subscriptionId } = await pendingSubscriptionFor("reconcile-missed-webhook@example.com");
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { updatedAt: new Date(Date.now() - RECONCILE_AFTER_MS - 1000) } });

    vi.spyOn(quickpay, "getSubscription").mockResolvedValue({ id: 12345, accepted: true });
    const charge = vi.spyOn(quickpay, "chargeRecurring").mockResolvedValue({ id: 1, accepted: true, operations: [{ type: "recurring", qp_status_code: "20000" }] });

    const result = await reconcilePendingSubscriptions();
    expect(result.healed).toBe(1);
    expect(result.reverted).toBe(0);
    // Healing charges the first period — never ACTIVE for free.
    expect(charge).toHaveBeenCalledTimes(1);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(after.tier).toBe("FAMILY");
    expect(after.status).toBe("ACTIVE");
    expect(after.currentPeriodEnd).not.toBeNull();
    expect(after.lastChargeOrderId).not.toBeNull();
  });

  it("reverts to FREE when the healing charge is declined", async () => {
    const { subscriptionId } = await pendingSubscriptionFor("reconcile-declined@example.com");
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { updatedAt: new Date(Date.now() - RECONCILE_AFTER_MS - 1000) } });
    vi.spyOn(quickpay, "getSubscription").mockResolvedValue({ id: 12345, accepted: true });
    vi.spyOn(quickpay, "chargeRecurring").mockResolvedValue({ id: 1, accepted: false, operations: [{ type: "recurring", qp_status_code: "40000" }] });

    expect(await reconcilePendingSubscriptions()).toEqual({ healed: 0, reverted: 1 });
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).toMatchObject({ tier: "FREE", status: "ACTIVE" });
  });

  it("leaves the row PENDING for the next run when the charge request itself fails", async () => {
    const { subscriptionId } = await pendingSubscriptionFor("reconcile-charge-error@example.com");
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { updatedAt: new Date(Date.now() - RECONCILE_AFTER_MS - 1000) } });
    vi.spyOn(quickpay, "getSubscription").mockResolvedValue({ id: 12345, accepted: true });
    vi.spyOn(quickpay, "chargeRecurring").mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await reconcilePendingSubscriptions()).toEqual({ healed: 0, reverted: 0 });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).status).toBe("PENDING");
  });

  it("does not touch a subscription still within its grace window (checkout genuinely in progress)", async () => {
    const { subscriptionId } = await pendingSubscriptionFor("reconcile-fresh@example.com");
    // updatedAt is "now" from the upsert above — well within the window.

    const spy = vi.spyOn(quickpay, "getSubscription");

    const result = await reconcilePendingSubscriptions();
    expect(result.healed).toBe(0);
    expect(result.reverted).toBe(0);
    expect(spy).not.toHaveBeenCalled();

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(after.status).toBe("PENDING");
  });

  it("treats a QuickPay lookup failure (e.g. 404 on an abandoned subscription) as never-completed, not a retry-forever state", async () => {
    const { subscriptionId } = await pendingSubscriptionFor("reconcile-404@example.com");
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { updatedAt: new Date(Date.now() - RECONCILE_AFTER_MS - 1000) } });

    vi.spyOn(quickpay, "getSubscription").mockRejectedValue(new Error("404"));

    const result = await reconcilePendingSubscriptions();
    expect(result.reverted).toBe(1);
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(after.status).toBe("ACTIVE");
    expect(after.tier).toBe("FREE");
  });
});
