import { Router } from "express";
import crypto from "node:crypto";
import type { BillingPeriod, BillingPlansResponse, SubscribeRequest, SubscribeResponse, SubscriptionDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "../../lib/billingPricing";
import * as quickpay from "../../lib/quickpay";
import { sendReceiptEmail } from "../../lib/billingReceipt";
import { notifyPaymentFailure } from "../../lib/paymentFailureNotice";
import { activateAfterAuthorization } from "../../lib/billingActivation";

export const billingRouter = Router();

function toDto(sub: {
  tier: string;
  status: string;
  billingPeriod: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}): SubscriptionDto {
  return {
    tier: sub.tier as SubscriptionDto["tier"],
    status: sub.status as SubscriptionDto["status"],
    billingPeriod: sub.billingPeriod as SubscriptionDto["billingPeriod"],
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    trialExpired: sub.status === "TRIALING" && sub.trialEndsAt !== null && sub.trialEndsAt.getTime() < Date.now(),
  };
}

// Real checkout whenever QuickPay is configured (test or live keys) — in
// production always, unless BILLING_TEST_MODE=true bypasses payment while the
// deployment is still being tested. Without keys outside production, a paid
// plan is switched on directly (local development).
function usesQuickpay(): boolean {
  if (config.billingTestMode) return false;
  return config.isProduction || Boolean(config.quickpayApiKey);
}

billingRouter.get("/plans", (_req, res) => {
  res.json({
    currency: "DKK",
    vatRate: 0.25,
    plans: (["PARENTS", "FAMILY"] as const).map((tier) => ({ tier, prices: BILLING_PRICES_ORE[tier] })),
  } satisfies BillingPlansResponse);
});

billingRouter.get("/status", requireAuth, async (req, res, next) => {
  try {
    const sub = await prisma.subscription.upsert({
      where: { ownerId: req.session.userId! },
      update: {},
      create: { ownerId: req.session.userId! },
    });
    res.json(toDto(sub));
  } catch (err) {
    next(err);
  }
});

// Switches the caller's plan. Three cases:
//
// 1. tier:FREE — never touches QuickPay, in any environment. There's nothing
//    to pay for, so this always just resets the row directly and returns
//    redirectUrl:null. This is also what makes "switch back to Free" possible
//    at all — there was previously no way to change `tier` back, only
//    `status` (via /cancel).
// 2. tier:PARENTS|FAMILY in production — unchanged real QuickPay checkout:
//    sets status:PENDING, redirects to QuickPay's hosted payment window, and
//    the webhook below confirms the charge.
// 3. tier:PARENTS|FAMILY outside production — this app is local-dev-only and
//    never deployed (no QuickPay account is configured here — quickpay.ts
//    throws immediately without QUICKPAY_API_KEY), so skip QuickPay entirely
//    and activate the tier directly, the same way case 1 does. A real
//    deployment (config.isProduction) normally always takes the real-payment
//    path — except while config.billingTestMode is on (BILLING_TEST_MODE=true
//    in production's .env), which gets the same free bypass for as long as
//    the production deployment is still in a testing phase. Unset that env
//    var and restart once real billing should be enforced — no code change
//    needed.
//
// An abandoned real checkout (case 2) leaves the subscription at
// tier:PARENTS/FAMILY, status:PENDING indefinitely (no reconciliation job
// yet) — but this is safe: requireActiveAccess and childCapForTier both gate
// on effectiveTier(), which only grants paid-tier benefits for status
// ACTIVE/TRIALING, treating PENDING/PAST_DUE/CANCELED as FREE regardless of
// `tier`. See middleware/billing.ts.
billingRouter.post("/subscribe", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as Partial<SubscribeRequest>;
    if (body.tier !== "FREE" && body.tier !== "PARENTS" && body.tier !== "FAMILY") {
      throw new ApiError(400, "tier must be FREE, PARENTS, or FAMILY");
    }

    if (body.tier === "FREE") {
      await prisma.subscription.upsert({
        where: { ownerId: userId },
        update: {
          tier: "FREE",
          status: "ACTIVE",
          billingPeriod: null,
          currentPeriodEnd: null,
          quickpaySubscriptionId: null,
          pastDueSince: null,
        },
        create: { ownerId: userId, tier: "FREE" },
      });
      res.json({ redirectUrl: null } satisfies SubscribeResponse);
      return;
    }

    if (body.billingPeriod !== "MONTHLY" && body.billingPeriod !== "ANNUAL") {
      throw new ApiError(400, "billingPeriod must be MONTHLY or ANNUAL");
    }
    const tier = body.tier;
    const billingPeriod = body.billingPeriod;
    // Starting at once means waiving the 14-day withdrawal right — only with
    // the customer's express, recorded consent.
    if (body.acceptWithdrawalWaiver !== true) {
      throw new ApiError(400, "Consent to start now and waive the 14-day right of withdrawal is required", "WITHDRAWAL_CONSENT_REQUIRED");
    }
    const withdrawalConsentAt = new Date();

    if (!usesQuickpay()) {
      await prisma.subscription.upsert({
        where: { ownerId: userId },
        update: {
          tier,
          status: "ACTIVE",
          billingPeriod,
          currentPeriodEnd: new Date(Date.now() + BILLING_PERIOD_DAYS[billingPeriod] * 24 * 60 * 60 * 1000),
          quickpaySubscriptionId: null,
          pastDueSince: null,
          withdrawalConsentAt,
        },
        create: {
          ownerId: userId,
          tier,
          status: "ACTIVE",
          billingPeriod,
          currentPeriodEnd: new Date(Date.now() + BILLING_PERIOD_DAYS[billingPeriod] * 24 * 60 * 60 * 1000),
          withdrawalConsentAt,
        },
      });
      await sendReceiptEmail(userId, tier, billingPeriod);
      res.json({ redirectUrl: null } satisfies SubscribeResponse);
      return;
    }

    const amountMinorUnits = BILLING_PRICES_ORE[tier][billingPeriod];
    const orderId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

    const created = await quickpay.createSubscription({
      orderId,
      currency: "DKK",
      description: `KidCom ${tier} (${billingPeriod})`,
    });

    await prisma.subscription.upsert({
      where: { ownerId: userId },
      update: {
        tier,
        status: "PENDING",
        billingPeriod,
        quickpaySubscriptionId: String(created.id),
        pastDueSince: null,
        withdrawalConsentAt,
      },
      create: {
        ownerId: userId,
        tier,
        status: "PENDING",
        billingPeriod,
        quickpaySubscriptionId: String(created.id),
        withdrawalConsentAt,
      },
    });

    const link = await quickpay.getSubscriptionLink({
      subscriptionId: created.id,
      amountMinorUnits,
      continueUrl: `${config.corsOrigin[0]}/billing?checkout=success`,
      cancelUrl: `${config.corsOrigin[0]}/billing?checkout=cancel`,
      callbackUrl: `${config.apiBaseUrl}/billing/webhook`,
    });

    res.json({ redirectUrl: link.url } satisfies SubscribeResponse);
  } catch (err) {
    next(err);
  }
});

// The app calls this when the customer returns from QuickPay's payment
// window (?checkout=success): if the card was authorised, charge the first
// period and switch the plan on — without waiting for the callback, which
// can't reach a development machine and may lag in production.
billingRouter.post("/confirm", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const sub = await prisma.subscription.findUnique({ where: { ownerId: userId } });
    if (sub?.status === "PENDING" && sub.quickpaySubscriptionId) {
      const { result, qpStatusCode } = await activateAfterAuthorization(sub.id);
      if (result === "activated") await sendReceiptEmail(userId, sub.tier as "PARENTS" | "FAMILY", sub.billingPeriod as BillingPeriod);
      // Only QuickPay's informational status code reaches the app, never
      // its message text (learn.quickpay.net/tech-talk/appendixes/errors).
      if (result === "declined") {
        throw new ApiError(402, "The card was declined", "PAYMENT_DECLINED", qpStatusCode ? { qpStatusCode } : undefined);
      }
    }
    const fresh = await prisma.subscription.upsert({ where: { ownerId: userId }, update: {}, create: { ownerId: userId } });
    res.json(toDto(fresh));
  } catch (err) {
    next(err);
  }
});

// Cancels the caller's subscription. Immediate (not end-of-period) — sets
// status:CANCELED so the daily renew-subscriptions job (which only selects
// status:ACTIVE) stops auto-charging, and effectiveTier() starts treating
// the account as FREE right away.
billingRouter.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const sub = await prisma.subscription.upsert({
      where: { ownerId: userId },
      update: { status: "CANCELED", pastDueSince: null },
      create: { ownerId: userId, status: "CANCELED" },
    });
    res.json(toDto(sub));
  } catch (err) {
    next(err);
  }
});

// QuickPay calls this directly — no session, no requireAuth. Authenticity
// comes entirely from the checksum. Payload shape here follows QuickPay's
// documented subscription/payment resource; the exact fields should be
// double-checked against a real test webhook on Charlie's machine (see
// chunk 7 plan notes — I don't have a live QuickPay account to inspect one).
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

    // A charge (the first period or a renewal): matched by its order_id.
    if (body.type === "Payment") {
      const charged = body.order_id ? await prisma.subscription.findFirst({ where: { lastChargeOrderId: body.order_id } }) : null;
      if (charged && body.accepted === false) {
        await prisma.subscription.update({ where: { id: charged.id }, data: { status: "PAST_DUE", pastDueSince: charged.pastDueSince ?? new Date() } });
        if (!charged.pastDueSince) await notifyPaymentFailure(charged.ownerId);
      } else if (charged && body.accepted === true && charged.status === "PAST_DUE") {
        await prisma.subscription.update({ where: { id: charged.id }, data: { status: "ACTIVE", pastDueSince: null } });
      }
      res.status(200).end();
      return;
    }

    const sub = await prisma.subscription.findFirst({
      where: { quickpaySubscriptionId: String(body.id) },
    });
    if (!sub) {
      // Not one of ours (or already handled) — ack so QuickPay doesn't retry.
      res.status(200).end();
      return;
    }

    // The card was authorised: charge the first period and switch the plan on.
    if (body.accepted === true && sub.status === "PENDING") {
      if ((await activateAfterAuthorization(sub.id)).result === "activated") {
        await sendReceiptEmail(sub.ownerId, sub.tier as "PARENTS" | "FAMILY", sub.billingPeriod as BillingPeriod);
      }
    } else if (body.accepted === true) {
      const periodDays = sub.billingPeriod ? BILLING_PERIOD_DAYS[sub.billingPeriod as "MONTHLY" | "ANNUAL"] : 30;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000),
          // Recovery — clears any grace window a prior failure started
          // (spec 9.12). No-op if this was never PAST_DUE (e.g. a fresh
          // checkout's first successful charge).
          pastDueSince: null,
        },
      });
      // sub.tier/billingPeriod are always PARENTS|FAMILY / MONTHLY|ANNUAL
      // here — this webhook only ever fires for a real QuickPay checkout,
      // which only ever exists for a paid-tier subscribe (see the
      // production branch of POST /subscribe above; the FREE branch never
      // touches QuickPay at all).
      await sendReceiptEmail(
        sub.ownerId,
        sub.tier as "PARENTS" | "FAMILY",
        sub.billingPeriod as BillingPeriod
      );
    } else if (body.accepted === false) {
      // Only stamp pastDueSince the *first* time this subscription enters
      // PAST_DUE — a webhook retry (or a second failed charge attempt
      // within the same grace window) must not push the 7-day clock back
      // out each time it fires.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE", pastDueSince: sub.pastDueSince ?? new Date() },
      });
      if (!sub.pastDueSince) {
        await notifyPaymentFailure(sub.ownerId);
      }
    } else {
      // `accepted` missing/undefined — QuickPay's exact payload shape for
      // this event isn't verified against a real account (see comment
      // above), so treat an absent field as "not a failure signal" rather
      // than guessing: leave status unchanged and just log it.
      // eslint-disable-next-line no-console
      console.warn(
        `QuickPay webhook for subscription ${sub.id} had no boolean 'accepted' field — leaving status (${sub.status}) unchanged`
      );
    }

    res.status(200).end();
  } catch (err) {
    next(err);
  }
});
