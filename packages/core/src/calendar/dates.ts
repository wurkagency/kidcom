// Calendar date math on "YYYY-MM-DD" keys. A key is a calendar day in
// Europe/Copenhagen (APP_TIME_ZONE); arithmetic is done on UTC midnights so
// daylight-saving changes can never shift a day.

import { APP_TIME_ZONE } from "../i18n/format";

export type DateKey = string;

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (key: DateKey) => Date.parse(`${key}T00:00:00Z`);
const fromUtc = (ms: number): DateKey => new Date(ms).toISOString().slice(0, 10);

/** The Copenhagen calendar day of an instant (default: now). */
export function dateKey(instant: Date | string | number = new Date()): DateKey {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date(instant));
}

export const addDays = (key: DateKey, days: number): DateKey => fromUtc(toUtc(key) + days * DAY_MS);

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DateKey): number {
  const d = new Date(toUtc(key)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the key's week. */
export const startOfWeek = (key: DateKey): DateKey => addDays(key, 1 - isoWeekday(key));

/** The seven days (Mon–Sun) of the key's week. */
export const weekDays = (key: DateKey): DateKey[] => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(key), i));

/** ISO-8601 week number. */
export function isoWeek(key: DateKey): number {
  const thursday = addDays(key, 4 - isoWeekday(key));
  const yearStart = Date.parse(`${thursday.slice(0, 4)}-01-01T00:00:00Z`);
  return Math.floor((toUtc(thursday) - yearStart) / DAY_MS / 7) + 1;
}

export const monthOf = (key: DateKey) => key.slice(0, 7);
export const firstOfMonth = (key: DateKey): DateKey => `${monthOf(key)}-01`;

export function addMonths(key: DateKey, months: number): DateKey {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/**
 * The month grid for the key's month: whole Monday-first weeks covering it
 * (5 or 6 rows), including the trailing/leading days of neighbour months.
 */
export function monthGrid(key: DateKey): DateKey[] {
  const first = firstOfMonth(key);
  const last = addDays(addMonths(key, 1), -1);
  const days: DateKey[] = [];
  for (let d = startOfWeek(first); d <= last || isoWeekday(d) !== 1; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The instant's Copenhagen wall-clock "HH:mm". */
export function timeKey(instant: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(instant),
  );
}

/** The UTC instant (ISO string) of a Copenhagen wall-clock day + "HH:mm". */
export function copenhagenInstant(day: DateKey, time = "00:00"): string {
  const wall = Date.parse(`${day}T${time}:00Z`);
  const offsetAt = (ms: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: APP_TIME_ZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - ms;
  };
  // Two passes settle the offset across a daylight-saving change.
  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first)).toISOString();
}
