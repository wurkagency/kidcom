import { ApiError } from "@kinnd/core";
import type { TierBlockReason } from "@kinnd/shared";

type T = (key: string, params?: Record<string, unknown>) => string;

// QuickPay's informational qp_status_code values
// (learn.quickpay.net/tech-talk/appendixes/errors). The API passes on only
// the code, never QuickPay's own message text; the copy lives in billing.json.
const QP_CODES = new Set(["30100", "30101", "40000", "40001", "40002", "40003", "40004", "40300", "41000", "42300", "50000", "50300"]);

// Subscription-model codes with translated copy (billing.json, errors.*).
const KNOWN_CODES = new Set([
  "PAYMENT_DECLINED",
  "PAYMENT_PROVIDER_ERROR",
  "TRIAL_USED",
  "ALREADY_SUBSCRIBED",
  "LIFETIME_PLAN",
  "NO_PLAN",
  "COUPON_INVALID",
  "COUPON_USED_UP",
  "COUPON_ALREADY_REDEEMED",
  "CIRCLE_FULL",
  "CIRCLE_UNAVAILABLE",
  "ALREADY_IN_CIRCLE",
  "NOT_YOUR_CIRCLE",
  "NOT_PARENT",
  "STORAGE_FULL",
  "UPLOAD_DAILY_LIMIT",
]);

/** Plan limits the app shows with an upgrade link (PlanNotice). */
export const PLAN_CODES = new Set(["PLAN_REQUIRED", "CHILD_LIMIT", "STORAGE_FULL", "TIER_UNAVAILABLE"]);

type Details = { requiredTier?: string; reason?: string; feature?: string; limit?: number; reasons?: TierBlockReason[] };

const details = (error: ApiError): Details => ((error.body as { details?: Details } | null)?.details ?? {}) as Details;

/** Why a tier can't hold what's in use, one line per reason. */
export function blockReasonText(reason: TierBlockReason, t: T): string {
  switch (reason.code) {
    case "CHILDREN":
      return t("reasons.CHILDREN", { count: reason.count, limit: reason.limit });
    case "ROLE":
      return t(`reasons.ROLE.${reason.role}`, { count: reason.count });
    case "CIRCLE_MEMBERS":
      return t("reasons.CIRCLE_MEMBERS", { count: reason.count });
    case "STORAGE":
      return t("reasons.STORAGE");
    case "FEATURE":
      return t(`reasons.FEATURE.${reason.feature}`);
  }
}

/** User-facing text for a failed billing or plan-limited request, in the user's language. */
export function billingErrorText(error: unknown, t: T): string {
  if (!(error instanceof ApiError)) return t("failed");
  const d = details(error);
  const qpStatusCode = (d as { qpStatusCode?: unknown }).qpStatusCode;
  if (typeof qpStatusCode === "string" && QP_CODES.has(qpStatusCode)) return t(`errors.qp.${qpStatusCode}`);
  if (error.code === "PLAN_REQUIRED") {
    if (d.feature) return t(`errors.PLAN_REQUIRED.feature.${d.feature}`);
    if (d.reason === "INVITE_ROLE") return t(`errors.PLAN_REQUIRED.invite.${d.requiredTier === "FAMILY" ? "FAMILY" : "PARENTS"}`);
    if (d.reason === "CIRCLE_MEMBERS") return t("errors.PLAN_REQUIRED.circleMembers");
    return t("errors.PLAN_REQUIRED.default");
  }
  if (error.code === "CHILD_LIMIT") return t("errors.CHILD_LIMIT", { limit: d.limit ?? 0 });
  if (error.code === "TIER_UNAVAILABLE") {
    const first = d.reasons?.[0];
    return first ? blockReasonText(first, t) : t("failed");
  }
  if (error.code && KNOWN_CODES.has(error.code)) return t(`errors.${error.code}`);
  return t("failed");
}

export const isPlanError = (error: unknown): boolean => error instanceof ApiError && !!error.code && PLAN_CODES.has(error.code);
