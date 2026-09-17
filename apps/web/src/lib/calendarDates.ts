import type { CalendarEventDto } from "@kidcom/shared";
import type { WeekStart } from "./preferences";

// Date helpers shared by CalendarShell and all three views — factored out of
// the old single-file CalendarPage.tsx so MonthView/WeekView/ListView don't
// each reimplement them slightly differently.

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Local calendar date (not UTC) — used only for "what is today" display
// purposes so a viewer west/east of UTC sees their own current day, not the
// UTC one. The custody-resolution math itself works in UTC-day terms
// internally (see packages/shared/src/custody.ts) and is unaffected.
export function toLocalDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Inverse of toLocalDateOnly — parses a "YYYY-MM-DD" string via the local
// Date constructor rather than `new Date(iso)` (which parses as UTC
// midnight, off by a day in any timezone behind UTC). Used to bridge this
// app's ISO-string date state to react-day-picker's Date-object API
// (MonthView.tsx), which does its own grid math in local-Date terms — as
// long as a Date is only ever built and read via matching local getters, it
// stays a plain "civil calendar date" container with no real timezone
// crossing, the same trick toDateOnly/toLocalDateOnly already rely on.
export function fromLocalDateOnly(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// An event "occurs" on a given date if that date falls anywhere in its
// [startsAt, endsAt] span (inclusive on both ends), not just on its exact
// start date — otherwise a multi-day event only ever shows on the day it
// began.
export function eventSpansDate(event: CalendarEventDto, dateIso: string): boolean {
  const startIso = toDateOnly(new Date(event.startsAt));
  const endIso = event.endsAt ? toDateOnly(new Date(event.endsAt)) : startIso;
  return dateIso >= startIso && dateIso <= endIso;
}

// Preference from App Preferences (Start of Week) decides whether a week
// begins Sunday or Monday.
export function startOfWeek(date: Date, weekStart: WeekStart): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayIdx = weekStart === "sunday" ? d.getUTCDay() : (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayIdx);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export const DAY_LABELS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LABELS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
