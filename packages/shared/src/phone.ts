// Mobile numbers: which countries KidCom texts, shared by the app's number
// picker and the API — the server enforces the same list the app offers, so
// a scripted client can't make us send SMS anywhere else (SMS pumping / toll
// fraud: attackers trigger codes to premium-rate numbers and pocket a share
// of what our SMS provider charges).

export type PhoneCountry = {
  /** ISO 3166-1 alpha-2 */
  iso: string;
  /** Dial code without "+" */
  dial: string;
  flag: string;
  /** A sample national number, shown as the input placeholder. */
  example: string;
  /**
   * National-number prefixes under this dial code we never text: other
   * countries sharing the code, premium-rate and personal-number ranges
   * (the usual targets of SMS pumping).
   */
  blockedPrefixes?: readonly string[];
};

// NANP (+1) area codes that aren't the US or Canada — Caribbean and Atlantic
// nations with their own (much higher) SMS termination rates, a classic
// toll-fraud target (NANPA assignments) — plus premium (900) and toll-free
// codes, which can't receive texts anyway.
const NANP_NOT_US_OR_CANADA = [
  "242", "246", "264", "268", "284", "345", "441", "473", "649", "658", "664", "721", "758", "767", "784",
  "809", "829", "849", "868", "869", "876", "900", "800", "833", "844", "855", "866", "877", "888",
] as const;

// The Nordics first (KidCom's markets, DK default), then common neighbours.
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "DK", dial: "45", flag: "🇩🇰", example: "20 12 34 56" },
  { iso: "NO", dial: "47", flag: "🇳🇴", example: "406 12 345" },
  { iso: "SE", dial: "46", flag: "🇸🇪", example: "70 123 45 67" },
  { iso: "FI", dial: "358", flag: "🇫🇮", example: "40 123 4567" },
  { iso: "IS", dial: "354", flag: "🇮🇸", example: "611 1234" },
  { iso: "DE", dial: "49", flag: "🇩🇪", example: "151 23456789" },
  // 070 = UK "personal numbers" (premium-priced forwarding, a fraud favourite); mobiles are 071–079.
  { iso: "GB", dial: "44", flag: "🇬🇧", example: "7400 123456", blockedPrefixes: ["70"] },
  { iso: "NL", dial: "31", flag: "🇳🇱", example: "6 12345678" },
  { iso: "PL", dial: "48", flag: "🇵🇱", example: "512 345 678" },
  { iso: "ES", dial: "34", flag: "🇪🇸", example: "612 34 56 78" },
  { iso: "FR", dial: "33", flag: "🇫🇷", example: "6 12 34 56 78" },
  { iso: "US", dial: "1", flag: "🇺🇸", example: "201 555 0123", blockedPrefixes: NANP_NOT_US_OR_CANADA },
];

export const DEFAULT_PHONE_COUNTRY: PhoneCountry = PHONE_COUNTRIES[0]!;

/** International format: "+" then 8–15 digits, no leading zero country code. */
export function isE164(phone: unknown): phone is string {
  return typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone);
}

// Country codes are prefix-free (ITU E.164), but match the longest first anyway.
const BY_DIAL_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/** The supported country an E.164 number belongs to, if any. */
export function phoneCountryOf(e164: string): PhoneCountry | null {
  return BY_DIAL_LENGTH.find((c) => e164.startsWith(`+${c.dial}`)) ?? null;
}

/** A well-formed number in a country KidCom texts, outside the blocked ranges. */
export function isSupportedPhone(phone: unknown): phone is string {
  if (!isE164(phone)) return false;
  const country = phoneCountryOf(phone);
  if (!country) return false;
  const national = phone.slice(1 + country.dial.length);
  return !(country.blockedPrefixes ?? []).some((prefix) => national.startsWith(prefix));
}
