import { ApiError } from "@kidcom/core";

type T = (key: string) => string;

// QuickPay's informational qp_status_code values
// (learn.quickpay.net/tech-talk/appendixes/errors). The API passes on only
// the code, never QuickPay's own message text; the copy lives in billing.json.
const QP_CODES = new Set(["30100", "30101", "40000", "40001", "40002", "40003", "40004", "40300", "41000", "42300", "50000", "50300"]);

/** User-facing text for a failed billing request, in the user's language. */
export function billingErrorText(error: unknown, t: T): string {
  if (!(error instanceof ApiError)) return t("failed");
  const qpStatusCode = (error.body as { details?: { qpStatusCode?: unknown } } | null)?.details?.qpStatusCode;
  if (typeof qpStatusCode === "string" && QP_CODES.has(qpStatusCode)) return t(`errors.qp.${qpStatusCode}`);
  if (error.code === "PAYMENT_DECLINED" || error.code === "PAYMENT_PROVIDER_ERROR") return t(`errors.${error.code}`);
  return t("failed");
}
