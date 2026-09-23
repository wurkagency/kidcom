import { ApiError } from "@kidcom/core";

type T = (key: string) => string;

// Server error codes with translated copy (auth namespace, errors.*).
const KNOWN_CODES = new Set([
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "PHONE_INVALID",
  "PHONE_TAKEN",
  "PASSWORD_TOO_WEAK",
  "PASSWORD_REUSED",
  "CODE_INCORRECT",
  "CODE_EXPIRED",
  "CODE_ATTEMPTS_EXCEEDED",
  "CODE_COOLDOWN",
  "RESET_LINK_INVALID",
  "VERIFY_LINK_INVALID",
]);

/**
 * User-facing text for a failed auth request: translated by the server's
 * error code when known, else the server's own message, else (no response
 * at all) a generic connectivity line.
 */
export function authErrorText(error: unknown, t: T): string {
  if (error instanceof ApiError) {
    if (error.code && KNOWN_CODES.has(error.code)) return t(`errors.${error.code}`);
    if (error.status === 429) return t("errors.CODE_COOLDOWN");
    return error.message;
  }
  return t("errors.network");
}

export const isErrorCode = (error: unknown, code: string) => error instanceof ApiError && error.code === code;
