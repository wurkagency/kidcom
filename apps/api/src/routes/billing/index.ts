import { Router } from "express";
import crypto from "node:crypto";
import type { SubscribeRequest, SubscribeResponse, SubscriptionDto } from "@kidcom/shared";

import { prisma } from "../../db";
import { config } from "../../config";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { BILLING_PERIOD_DAYS, BILLING_PRICES_ORE } from "../../lib/billingPricing";
import * as quickpay from "../../lib/quickpay";

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

// Starts (or restarts) a checkout for a paid tier. Sets the local row to the
// requested tier/status:PENDING immediately (so the UI can reflect "upgrade
// in progress"), then redirects the browser to QuickPay's hosted payment
// window. The webhook below is what actually confirms the charge.
//
// An abandoned checkout leaves the subscription at tier:PARENTS/FAMILY,
// status:PENDING indefinitely (no reconciliation job yet) — but this is safe:
// requireActiveAccess and childCapForTier both gate on effectiveTier(), which
// only grants paid-tier benefits for status ACTIVE/TRIALING, treating
// PENDING/PAST_DUE/CANCELED as FREE regardless of `tier`. See
// middleware/billing.ts.
billingRouter.post("/subscribe", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as Partial<SubscribeRequest>;
    if (body.tier !== "PARENTS" && body.tier !== "FAMILY") {
      throw new ApiError(400, "tier must be PARENTS or FAMILY");
    }
    if (body.billingPeriod !== "MONTHLY" && body.billingPeriod !== "ANNUAL") {
      throw new ApiError(400, "billingPeriod must be MONTHLY or ANNUAL");
    }

    const amountMinorUnits = BILLING_PRICES_ORE[body.tier][body.billingPeriod];
    const orderId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

    const created = await quickpay.createSubscription({
      orderId,
      currency: "DKK",
      description: `KidCom ${body.tier} (${body.billingPeriod})`,
    });

    await prisma.subscription.upsert({
      where: { ownerId: userId },
      update: {
        tier: body.tier,
        status: "PENDING",
        billingPeriod: body.billingPeriod,
        quickpaySubscriptionId: String(created.id),
      },
      create: {
        ownerId: userId,
        tier: body.tier,
        status: "PENDING",
        billingPeriod: body.billingPeriod,
        quickpaySubscriptionId: String(created.id),
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

// Cancels the caller's subscription. Immediate (not end-of-period) — sets
// status:CANCELED so the daily renew-subscriptions job (which only selects
// status:ACTIVE) stops auto-charging, and effectiveTier() starts treating
// the account as FREE right away.
billingRouter.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const sub = await prisma.subscription.upsert({
      where: { ownerId: userId },
      update: { status: "CANCELED" },
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

    const body = req.body as { id?: number; accepted?: boolean };
    if (body.id === undefined) {
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

    if (body.accepted === true) {
      const periodDays = sub.billingPeriod ? BILLING_PERIOD_DAYS[sub.billingPeriod as "MONTHLY" | "ANNUAL"] : 30;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000),
        },
      });
    } else if (body.accepted === false) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
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
