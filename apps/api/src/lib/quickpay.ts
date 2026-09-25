// Thin client around QuickPay's v10 REST API (docs: learn.quickpay.net/tech-talk).
// Real calls, not a stub — but unverifiable end-to-end from this sandbox (no
// merchant account, no network path to quickpay.net here). See chunk 7 plan
// notes for what to check on Charlie's machine with real test-mode keys.
import crypto from "node:crypto";

import { config } from "../config";
import { ApiError } from "../middleware/errorHandler";

// QuickPay's informational status codes (qp_status_code,
// learn.quickpay.net/tech-talk/appendixes/errors/) — the only payment detail
// the app is ever told. QuickPay's own error text stays in the server log.
export const QP_STATUS_CODES = ["30100", "30101", "40000", "40001", "40002", "40003", "40004", "40300", "41000", "42300", "50000", "50300"] as const;
export type QpStatusCode = (typeof QP_STATUS_CODES)[number];
const QP_APPROVED = "20000";
const isQpStatusCode = (code: unknown): code is QpStatusCode => (QP_STATUS_CODES as readonly unknown[]).includes(code);

/** A failed QuickPay request. The client sees a generic message plus, when QuickPay gave one, its informational status code. */
export class QuickPayError extends ApiError {
  constructor(
    readonly providerStatus: number,
    /** QuickPay's response body — for the server log only, never sent to the app. */
    readonly providerText: string,
    qpStatusCode: QpStatusCode | null
  ) {
    super(502, "The payment service couldn't complete this — please try again", "PAYMENT_PROVIDER_ERROR", qpStatusCode ? { qpStatusCode } : undefined);
  }
}

export type PaymentOperation = { type: string; qp_status_code?: string; pending?: boolean };
export type Payment = { id: number; accepted: boolean; order_id?: string; operations?: PaymentOperation[] };

/**
 * Whether a payment was declined, and QuickPay's informational code for it.
 * Pending operations aren't a decline (the callback settles them later).
 */
export function paymentOutcome(payment: Payment | null): { declined: boolean; qpStatusCode: QpStatusCode | null } {
  const failed = [...(payment?.operations ?? [])].reverse().find((op) => op.qp_status_code && op.qp_status_code !== QP_APPROVED && !op.pending);
  if (!failed) return { declined: false, qpStatusCode: null };
  return { declined: true, qpStatusCode: isQpStatusCode(failed.qp_status_code) ? failed.qp_status_code : null };
}

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
    // eslint-disable-next-line no-console
    console.error(`QuickPay ${init.method} ${path} failed (${res.status}): ${text.slice(0, 1000)}`);
    let qpStatusCode: QpStatusCode | null = null;
    try {
      const body = JSON.parse(text) as { qp_status_code?: unknown; operations?: PaymentOperation[] };
      const code = body.qp_status_code ?? [...(body.operations ?? [])].reverse().find((op) => op.qp_status_code)?.qp_status_code;
      if (isQpStatusCode(code)) qpStatusCode = code;
    } catch {
      // Not JSON — nothing informational to pass on.
    }
    throw new QuickPayError(res.status, text, qpStatusCode);
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
}): Promise<Payment> {
  return quickpayFetch<Payment>(`/subscriptions/${params.subscriptionId}/recurring`, {
    method: "POST",
    body: { amount: params.amountMinorUnits, order_id: params.orderId, auto_capture: true },
  });
}

// GET /payments?order_id= — the payment already made under an order_id
// (order_ids are unique per QuickPay account, so at most one).
export async function findPaymentsByOrderId(orderId: string): Promise<Payment[]> {
  return quickpayFetch<Payment[]>(`/payments?order_id=${encodeURIComponent(orderId)}`, { method: "GET" });
}

// GET /payments/:id — check the acquirer's result for a recurring charge.
export async function getPayment(paymentId: number): Promise<{
  id: number;
  accepted: boolean;
  operations: { type: string; qp_status_code?: string }[];
}> {
  return quickpayFetch(`/payments/${paymentId}`, { method: "GET" });
}

// POST /subscriptions/:id/cancel — stops the card authorisation, so the
// subscription can't be charged again (cancelled plan, coupon, deletion).
export async function cancelSubscription(subscriptionId: number): Promise<void> {
  await quickpayFetch(`/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
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
  /** Authorised with a QuickPay test card (no money moves). */
  test_mode?: boolean;
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
