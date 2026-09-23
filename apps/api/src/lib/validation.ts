import { ApiError } from "../middleware/errorHandler";

// Small request-validation helpers shared by the v3.0 routers.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A required, trimmed, length-limited string. */
export function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${field} is required`);
  const text = value.trim();
  if (text.length > max) throw new ApiError(400, `${field} must be at most ${max} characters`);
  return text;
}

/** An optional string: undefined = unchanged, null/"" = cleared. */
export function optionalText(value: unknown, field: string, max = 2000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, `${field} must be text`);
  const text = value.trim();
  if (text.length > max) throw new ApiError(400, `${field} must be at most ${max} characters`);
  return text || null;
}

/** "YYYY-MM-DD" → Date at UTC midnight; undefined = unchanged, null = cleared. */
export function optionalDateOnly(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !DATE_ONLY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiError(400, `${field} must be a date (YYYY-MM-DD)`);
  }
  return new Date(`${value}T00:00:00Z`);
}

export function requiredDateOnly(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_ONLY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiError(400, `${field} must be a date (YYYY-MM-DD)`);
  }
  return value;
}

export function isHHMM(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

export const dateOnlyString = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** Europe/Copenhagen's UTC offset in minutes at `at` (60 in winter, 120 in summer). */
function copenhagenOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const wall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((wall - at.getTime()) / 60000);
}

/**
 * The instant a Copenhagen calendar day begins ("2026-09-24" → 2026-09-23T22:00Z).
 * A family's day is a Danish day: range queries must use this, not UTC midnight,
 * or anything between 00:00 and 01:00/02:00 local lands on the previous day.
 */
export function copenhagenMidnight(dateKey: string): Date {
  const utcMidnight = new Date(`${dateKey}T00:00:00Z`);
  let instant = new Date(utcMidnight.getTime() - copenhagenOffsetMinutes(utcMidnight) * 60000);
  // Re-check once: the offset at the true local midnight can differ on DST days.
  instant = new Date(utcMidnight.getTime() - copenhagenOffsetMinutes(instant) * 60000);
  return instant;
}

/** Today's calendar date in Europe/Copenhagen, "YYYY-MM-DD". */
export function copenhagenToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}
