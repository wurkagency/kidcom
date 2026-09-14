import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../../app";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";
import { mailSender, MemoryMailSender } from "../../lib/mailSender";

// D9 (spec 9.14/§6.3): proves the receipt this phase adds actually carries a
// correct VAT breakdown, and that the breakdown sums back to the unchanged
// gross price — not just that an email was "sent" somewhere.
describe("POST /billing/subscribe — D9 VAT receipt", () => {
  beforeEach(async () => {
    await resetDb();
    (mailSender as MemoryMailSender).sent.length = 0;
  });

  it("emails a receipt with gross/net/VAT figures that sum to the unchanged gross price (Parents, monthly)", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app); // also sends a verification email — filter it out below

    const res = await agent.post("/billing/subscribe").send({ tier: "PARENTS", billingPeriod: "MONTHLY" });
    expect(res.status).toBe(200);
    expect(res.body.redirectUrl).toBeNull();

    const sender = mailSender as MemoryMailSender;
    const receipts = sender.sent.filter((m) => m.subject.includes("receipt"));
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    expect(receipt.subject).toContain("Parents");
    // Gross stays exactly what BILLING_PRICES_ORE already charges (D9 must
    // not touch the price) — net + VAT must sum back to it.
    expect(receipt.text).toContain("Price excl. VAT: 23.20 kr");
    expect(receipt.text).toContain("VAT (25%): 5.80 kr");
    expect(receipt.text).toContain("Total charged: 29.00 kr");
    expect(receipt.html).toContain("23.20");
    expect(receipt.html).toContain("5.80");
    expect(receipt.html).toContain("29.00");
  });

  it("emails a receipt with the Family/annual figures (559 -> 447.20 net + 111.80 VAT)", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.post("/billing/subscribe").send({ tier: "FAMILY", billingPeriod: "ANNUAL" });
    expect(res.status).toBe(200);

    const sender = mailSender as MemoryMailSender;
    const receipts = sender.sent.filter((m) => m.subject.includes("receipt"));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].text).toContain("Price excl. VAT: 447.20 kr");
    expect(receipts[0].text).toContain("VAT (25%): 111.80 kr");
    expect(receipts[0].text).toContain("Total charged: 559.00 kr");
  });

  it("does not send a receipt for the FREE tier (nothing was charged)", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app);

    const res = await agent.post("/billing/subscribe").send({ tier: "FREE" });
    expect(res.status).toBe(200);

    const receipts = (mailSender as MemoryMailSender).sent.filter((m) => m.subject.includes("receipt"));
    expect(receipts).toHaveLength(0);
  });
});
