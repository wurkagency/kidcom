// Thin client around QuickPay's v10 REST API (docs: learn.quickpay.net/tech-talk).
// Real calls, not a stub — but unverifiable end-to-end from this sandbox (no
// merchant account, no network path to quickpay.net here). See chunk 7 plan
// notes for what to check on Charlie's machine with real test-mode keys.
import crypto from "node:crypto";

import { config } from "../config";
import { ApiError } from "../middleware/errorHandler";

function authHeader(): string {
  if (!config.quickpayApiKey) {
    throw new ApiError(500, "QuickPay isn't configured (QUICKPAY_API_KEY missing)");
  }
  return `Basic ${Buffer.from(`:${config.quickpayApiKey}`).toString("base64")}`;
}

async function quickpayFetch<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${config.quickpayBaseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Accept-Version": "v10",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(502, `QuickPay request failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

// POST /subscriptions — creates a subscription "shell" (no card/charge yet).
// order_id must be unique per QuickPay account and <= 20 chars.
export async function createSubscription(params: {
  orderId: string;
  currency: string;
  description: string;
}): Promise<{ id: number }> {
  return quickpayFetch<{ id: number }>("/subscriptions", {
    method: "POST",
    body: { order_id: params.orderId, currency: params.currency, description: params.description },
  });
}

// PUT /subscriptions/:id/link — returns a hosted payment-window URL where the
// customer enters card details. amountMinorUnits is in the currency's
// smallest unit (øre for DKK). Authorizing here doesn't charge anything yet
// — that happens via chargeRecurring below (or immediately, for the first
// period, via the same recurring call once the link confirms authorization).
export async function getSubscriptionLink(params: {
  subscriptionId: number;
  amountMinorUnits: number;
  continueUrl: string;
  cancelUrl: string;
  callbackUrl: string;
}): Promise<{ url: string }> {
  return quickpayFetch<{ url: string }>(`/subscriptions/${params.subscriptionId}/link`, {
    method: "PUT",
    body: {
      amount: params.amountMinorUnits,
      continueurl: params.continueUrl,
      cancelurl: params.cancelUrl,
      callbackurl: params.callbackUrl,
      auto_capture: true,
    },
  });
}

// POST /subscriptions/:id/recurring — charges the next period against an
// already-authorized subscription. Used both for the very first successful
// period (triggered from the webhook once the link authorizes) and for the
// daily renewal job in worker.ts.
export async function chargeRecurring(params: {
  subscriptionId: number;
  amountMinorUnits: number;
  orderId: string;
}): Promise<{ id: number }> {
  return quickpayFetch<{ id: number }>(`/subscriptions/${params.subscriptionId}/recurring`, {
    method: "POST",
    body: { amount: params.amountMinorUnits, order_id: params.orderId, auto_capture: true },
  });
}

// GET /payments/:id — check the acquirer's result for a recurring charge.
export async function getPayment(paymentId: number): Promise<{
  id: number;
  accepted: boolean;
  operations: { type: string; qp_status_code?: string }[];
}> {
  return quickpayFetch(`/payments/${paymentId}`, { method: "GET" });
}

// GET /subscriptions/:id — post-launch backlog Phase E (D7): the missing
// piece for reconciling a checkout that started (createSubscription above)
// but whose webhook never arrived, because the customer simply never
// finished the hosted payment window. `accepted` mirrors whether the
// subscription's authorization actually went through, independent of
// whatever our own DB row's `status` still says.
export async function getSubscription(subscriptionId: number): Promise<{
  id: number;
  accepted: boolean;
}> {
  return quickpayFetch(`/subscriptions/${subscriptionId}`, { method: "GET" });
}

// Verifies the `QuickPay-Checksum-Sha256` header against the RAW request
// body (not the re-serialized JSON — QuickPay signs the exact bytes they
// sent, and re-stringifying can produce different whitespace/key order).
export function verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !config.quickpayPrivateKey) return false;
  const expected = crypto.createHmac("sha256", config.quickpayPrivateKey).update(rawBody).digest("hex");
  // Constant-time compare — both must be equal length for timingSafeEqual.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
