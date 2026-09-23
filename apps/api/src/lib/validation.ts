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

/** Today's calendar date in Europe/Copenhagen, "YYYY-MM-DD". */
export function copenhagenToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}
