// Theme-independent form logic for the account screens.

// ---------------------------------------------------------------------------
// Mobile numbers
// ---------------------------------------------------------------------------

// The supported countries (and the ranges never texted) live in
// @kidcom/shared, so the API enforces exactly the list offered here.
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, type PhoneCountry } from "@kidcom/shared";

export { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES };
export type { PhoneCountry };

/**
 * Builds an E.164 number from a dial code and what the user typed. Accepts
 * spaces, dashes, a leading national trunk "0" and a pasted full "+45…"
 * number. Returns null when the result can't be a valid number.
 */
export function toE164(dial: string, input: string): string | null {
  const raw = input.trim();
  let digits: string;
  if (raw.startsWith("+")) {
    digits = raw.slice(1).replace(/\D/g, "");
  } else if (raw.startsWith("00")) {
    digits = raw.slice(2).replace(/\D/g, "");
  } else {
    digits = dial + raw.replace(/\D/g, "").replace(/^0+/, "");
  }
  const e164 = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** "+4520123456" → "+45 •• •• •• 56" — shown on the code screen. */
export function maskPhone(e164: string): string {
  const country = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => e164.startsWith(`+${c.dial}`));
  const dial = country?.dial ?? e164.slice(1, 3);
  const national = e164.slice(1 + dial.length);
  return `+${dial} ${"•".repeat(Math.max(0, national.length - 2))}${national.slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Passwords — the rules the API enforces (apps/api/src/lib/passwordPolicy.ts),
// evaluated live for the checklist on the password screens. The "not used in
// the past 90 days" rule can only be checked by the server.
// ---------------------------------------------------------------------------

export type PasswordCheck = {
  length: boolean;
  numberOrSymbol: boolean;
  /** 0 = empty, 1 = weak, 2 = fair, 3 = strong */
  strength: 0 | 1 | 2 | 3;
  valid: boolean;
};

export function checkPassword(password: string): PasswordCheck {
  const length = password.length >= 8;
  const numberOrSymbol = /[\d\W_]/.test(password);
  let strength: PasswordCheck["strength"] = 0;
  if (password.length > 0) {
    const variety = [/[a-z]/, /[A-Z]/, /\d/, /[\W_]/].filter((r) => r.test(password)).length;
    strength = length && numberOrSymbol && (password.length >= 12 || variety >= 3) ? 3 : length && numberOrSymbol ? 2 : 1;
  }
  return { length, numberOrSymbol, strength, valid: length && numberOrSymbol };
}

/** "Sarah Jenkins" → first "Sarah", last "Jenkins"; "Madonna" → last "". */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}
