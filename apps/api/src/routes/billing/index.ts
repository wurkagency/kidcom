import { Router } from "express";
import type { Request, Response } from "express";
import type {
  BillingPeriod,
  BillingPlansResponse,
  CircleInviteRequest,
  PaidTier,
  RedeemCouponRequest,
  StartTrialRequest,
  SubscribeRequest,
  SubscribeResponse,
} from "@kinnd/shared";
import { TIERS, TIER_ORDER, TIER_PRICES_ORE, TRIAL_DAYS, VAT_RATE, isValidEmail } from "@kinnd/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth, requireVerifiedEmail } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import * as quickpay from "../../lib/quickpay";
import { sendReceiptEmail } from "../../lib/billingReceipt";
import { activateAfterAuthorization } from "../../lib/billingActivation";
import {
  activateWithoutPayment,
  billingStatus,
  cancelCircle,
  cancelCircleInvite,
  changeTier,
  handleDeclinedCharge,
  inviteToCircle,
  leaveCircle,
  redeemCoupon,
  removeCircleMember,
  startCheckout,
  startTrial,
} from "../../lib/billing";

// The subscription model (tasks: subscription model plan). A subscription
// is a Circle owned by the person who pays; Single (FREE) is free with no
// Circle. See lib/billing.ts for the flows and lib/circleLifecycle.ts for
// what happens when a Circle stops being paid for.
export const billingRouter = Router();

const PAID: PaidTier[] = ["PARENTS", "FAMILY"];
const isPaidTier = (t: unknown): t is PaidTier => PAID.includes(t as PaidTier);
const isPeriod = (p: unknown): p is BillingPeriod => p === "MONTHLY" || p === "ANNUAL";

// Real checkout whenever QuickPay is configured (test or live keys) — in
// production always, unless BILLING_TEST_MODE=true switches plans on
// without payment while a deployment is being tested. Without keys outside
// production, a paid plan is switched on directly (local development).
function usesQuickpay(): boolean {
  if (config.billingTestMode) return false;
  return config.isProduction || Boolean(config.quickpayApiKey);
}

billingRouter.get("/plans", (_req, res) => {
  res.json({
    currency: "DKK",
    vatRate: VAT_RATE,
    trialDays: TRIAL_DAYS,
    plans: TIER_ORDER.map((tier) => ({
      tier,
      prices: tier === "FREE" ? null : TIER_PRICES_ORE[tier],
      limits: TIERS[tier],
    })),
  } satisfies BillingPlansResponse);
});

billingRouter.get("/status", requireAuth, async (req, res, next) => {
  try {
    res.json(await billingStatus(req.session.userId!));
  } catch (err) {
    next(err);
  }
});

// 30 days of a Parent or Family Circle, no card (D3).
billingRouter.post("/trial", requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    const { tier } = req.body as Partial<StartTrialRequest>;
    if (!isPaidTier(tier)) throw new ApiError(400, "tier must be PARENTS or FAMILY");
    await startTrial(req.session.userId!, tier);
    res.json(await billingStatus(req.session.userId!));
  } catch (err) {
    next(err);
  }
});

// Paying for a plan (or adding a card during the trial). FREE cancels.
async function checkout(req: Request, res: Response) {
  const userId = req.session.userId!;
  const body = req.body as Partial<SubscribeRequest>;
  if (body.tier === "FREE") {
    await cancelCircle(userId);
    res.json({ redirectUrl: null } satisfies SubscribeResponse);
    return;
  }
  if (!isPaidTier(body.tier)) throw new ApiError(400, "tier must be FREE, PARENTS, or FAMILY");
  if (!isPeriod(body.billingPeriod)) throw new ApiError(400, "billingPeriod must be MONTHLY or ANNUAL");
  // Starting at once means waiving the 14-day withdrawal right — only with
  // the customer's express, recorded consent.
  if (body.acceptWithdrawalWaiver !== true) {
    throw new ApiError(400, "Consent to start now and waive the 14-day right of withdrawal is required", "WITHDRAWAL_CONSENT_REQUIRED");
  }
  const consentAt = new Date();
  if (!usesQuickpay()) {
    await activateWithoutPayment(userId, body.tier, body.billingPeriod);
    await prisma.subscription.update({ where: { ownerId: userId }, data: { withdrawalConsentAt: consentAt } });
    await sendReceiptEmail(userId, body.tier, body.billingPeriod);
    res.json({ redirectUrl: null } satisfies SubscribeResponse);
    return;
  }
  res.json((await startCheckout(userId, body.tier, body.billingPeriod, consentAt)) satisfies SubscribeResponse);
}

billingRouter.post("/checkout", requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    await checkout(req, res);
  } catch (err) {
    next(err);
  }
});
// Kept for older app builds: same as /checkout.
billingRouter.post("/subscribe", requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    await checkout(req, res);
  } catch (err) {
    next(err);
  }
});

// The app calls this when the customer returns from QuickPay's payment
// window (?checkout=success). In a trial it records the card; otherwise it
// charges the first period and switches the plan on — without waiting for
// the callback, which can't reach a development machine and may lag.
billingRouter.post("/confirm", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const sub = await prisma.subscription.findUnique({ where: { ownerId: userId } });
    if (sub?.quickpaySubscriptionId && (sub.status === "PENDING" || sub.status === "TRIALING")) {
      const { result, qpStatusCode } = await activateAfterAuthorization(sub.id);
      if (result === "activated") await sendReceiptEmail(userId, sub.tier as PaidTier, sub.billingPeriod as BillingPeriod);
      // Only QuickPay's informational status code reaches the app, never
      // its message text (learn.quickpay.net/tech-talk/appendixes/errors).
      if (result === "declined") {
        throw new ApiError(402, "The card was declined", "PAYMENT_DECLINED", qpStatusCode ? { qpStatusCode } : undefined);
      }
    }
    res.json(await billingStatus(userId));
  } catch (err) {
    next(err);
  }
});

billingRouter.post("/change", requireAuth, async (req, res, next) => {
  try {
    const { tier } = req.body as { tier?: unknown };
    if (!isPaidTier(tier)) throw new ApiError(400, "tier must be PARENTS or FAMILY");
    await changeTier(req.session.userId!, tier);
    res.json(await billingStatus(req.session.userId!));
  } catch (err) {
    next(err);
  }
});

billingRouter.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    await cancelCircle(req.session.userId!);
    res.json(await billingStatus(req.session.userId!));
  } catch (err) {
    next(err);
  }
});

billingRouter.post("/coupon", requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    const { code } = req.body as Partial<RedeemCouponRequest>;
    if (!code || typeof code !== "string") throw new ApiError(400, "code is required");
    await redeemCoupon(req.session.userId!, code);
    res.json(await billingStatus(req.session.userId!));
  } catch (err) {
    next(err);
  }
});

// Family Circle members (rule 3): other parents invited into the Circle.
billingRouter.post("/circle/invites", requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    const { email } = req.body as Partial<CircleInviteRequest>;
    if (!email || !isValidEmail(email)) throw new ApiError(400, "Please enter a valid email address");
    res.status(201).json(await inviteToCircle(req.session.userId!, email));
  } catch (err) {
    next(err);
  }
});

billingRouter.delete("/circle/invites/:inviteId", requireAuth, async (req, res, next) => {
  try {
    await cancelCircleInvite(req.session.userId!, req.params.inviteId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

billingRouter.delete("/circle/members/:userId", requireAuth, async (req, res, next) => {
  try {
    await removeCircleMember(req.session.userId!, req.params.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

billingRouter.post("/circle/leave", requireAuth, async (req, res, next) => {
  try {
    await leaveCircle(req.session.userId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// QuickPay calls this directly — no session, no requireAuth. Authenticity
// comes entirely from the checksum.
billingRouter.post("/webhook", async (req, res, next) => {
  try {
    const signature = req.headers["quickpay-checksum-sha256"] as string | undefined;
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    if (!quickpay.verifyWebhookSignature(raw, signature)) {
      throw new ApiError(401, "Invalid QuickPay webhook signature");
    }

    const body = req.body as { id?: number; type?: string; accepted?: boolean; order_id?: string };
    if (body.id === undefined) {
      res.status(200).end();
      return;
    }

    // A charge (the first period or a renewal), matched by its order_id.
    // Declined is declined (D5): the Circle ends at once.
    if (body.type === "Payment") {
      const charged = body.order_id ? await prisma.subscription.findFirst({ where: { lastChargeOrderId: body.order_id } }) : null;
      if (charged && body.accepted === false) await handleDeclinedCharge(charged.id);
      res.status(200).end();
      return;
    }

    const sub = await prisma.subscription.findFirst({ where: { quickpaySubscriptionId: String(body.id) } });
    if (!sub) {
      // Not one of ours (or already handled) — ack so QuickPay doesn't retry.
      res.status(200).end();
      return;
    }
    // The card was authorised: record it (trial) or charge the first period.
    if (body.accepted === true && (sub.status === "PENDING" || sub.status === "TRIALING")) {
      if ((await activateAfterAuthorization(sub.id)).result === "activated") {
        await sendReceiptEmail(sub.ownerId, sub.tier as PaidTier, sub.billingPeriod as BillingPeriod);
      }
    }
    res.status(200).end();
  } catch (err) {
    next(err);
  }
});
