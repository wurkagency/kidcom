// Formats follow the user's country, not the UI language: a Dane reading
// Kinnd in English still sees 26.09.2026, 15.00, 1.234,5 and weeks that
// start on Monday. The region is the account's own choice, else the
// device's (navigator.languages), else Denmark.

import { isRegion } from "@kinnd/shared";

export { isRegion };

export const DEFAULT_REGION = "DK";

/** The first region the device's language list names ("en-DK" → "DK"). */
export function detectRegion(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages): string | null {
  for (const tag of languages) {
    try {
      const region = new Intl.Locale(tag).region;
      if (region && isRegion(region)) return region;
    } catch {
      // Not a valid BCP 47 tag; try the next one.
    }
  }
  return null;
}

export function resolveRegion(userRegion: string | null | undefined, detected: string | null = detectRegion()): string {
  if (isRegion(userRegion)) return userRegion;
  return detected ?? DEFAULT_REGION;
}

export type FormatLocales = {
  /** Formats with words (month and weekday names, "3 hours ago"): the UI language in the region's order and punctuation — "26 Sept 2026". */
  text: string;
  /** All-numeric formats (dates, times, numbers): the country's own conventions — "26.09.2026", "15.00", "1.234,5". */
  numeric: string;
};

export function formatLocales(language: string, region: string): FormatLocales {
  const lang = new Intl.Locale(language).language;
  const native = new Intl.Locale(`und-${region}`).maximize();
  return { text: `${lang}-${region}`, numeric: `${native.language}-${region}` };
}

// Where Intl has no week data (Firefox), the regions whose week starts on Sunday.
const SUNDAY_REGIONS = new Set(["US", "CA", "MX", "BR", "JP", "KR", "TW", "HK", "IL", "PH", "IN", "ZA", "AU", "SA", "PE", "CO", "VE", "GT"]);

type WeekInfo = { firstDay: number };

/** 1 = Monday … 7 = Sunday (ISO), for the region. */
export function weekStartOf(region: string): number {
  const locale = new Intl.Locale(`und-${region}`).maximize() as Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };
  const info = locale.getWeekInfo?.() ?? locale.weekInfo;
  if (info?.firstDay) return info.firstDay;
  return SUNDAY_REGIONS.has(region) ? 7 : 1;
}

/**
 * A number typed by hand, in either convention: "48,5", "48.5", "1.234,5",
 * "1,234.5", "1 234,5". With both marks, the last is the decimal mark; a
 * mark used once is the decimal mark ("3,250" kg is 3.25, not 3250); a mark
 * repeated is grouping ("1.234.567").
 */
export function parseDecimal(input: string): number {
  const s = input.trim().replace(/[\s\u00a0\u202f']/g, "");
  if (!/^[-+]?(\d|[.,]\d)[\d.,]*$/.test(s)) return Number.NaN;
  const mark = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (mark === -1) return Number(s);
  const both = s.includes(",") && s.includes(".");
  const repeated = s.split(s[mark]!).length > 2;
  if (!both && repeated) return Number(s.replace(/[.,]/g, ""));
  return Number(`${s.slice(0, mark).replace(/[.,]/g, "")}.${s.slice(mark + 1)}`);
}

export type DatePart = "day" | "month" | "year";
/** How the region writes an all-numeric date: its field order and separator ("DK": day.month.year). */
export type DateInputPattern = { order: DatePart[]; separator: string };

/** The region's numeric date layout, read from Intl: "31.07.2015" (DK), "31/07/2015" (GB), "07/31/2015" (US), "2015-07-31" (SE). */
export function dateInputPattern(numericLocale: string): DateInputPattern {
  const parts = new Intl.DateTimeFormat(numericLocale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).formatToParts(
    new Date(Date.UTC(2015, 6, 31))
  );
  const order = parts.map((p) => p.type).filter((t): t is DatePart => t === "day" || t === "month" || t === "year");
  const separator = parts.find((p) => p.type === "literal")?.value.trim() || "/";
  return order.length === 3 ? { order, separator } : { order: ["day", "month", "year"], separator: "." };
}

/** "2015-07-31" shown the region's way: "31.07.2015". */
export function formatDateInput(day: string, pattern: DateInputPattern): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return "";
  const values: Record<DatePart, string> = { year: m[1]!, month: m[2]!, day: m[3]! };
  return pattern.order.map((p) => values[p]).join(pattern.separator);
}

/**
 * A date typed by hand, in the region's order, with any separator ("31.07.2015",
 * "31/7/2015", "31-07-2015", "31 07 2015") or none ("31072015"). The year must
 * have four digits. Returns "YYYY-MM-DD", or null when it isn't a real date.
 */
export function parseDateInput(input: string, pattern: DateInputPattern): string | null {
  const s = input.trim();
  let fields = s.split(/[^\d]+/).filter(Boolean);
  if (fields.length === 1 && fields[0]!.length === 8) {
    const digits = fields[0]!;
    let at = 0;
    fields = pattern.order.map((p) => {
      const len = p === "year" ? 4 : 2;
      const part = digits.slice(at, at + len);
      at += len;
      return part;
    });
  }
  if (fields.length !== 3) return null;
  const values = {} as Record<DatePart, string>;
  pattern.order.forEach((p, i) => (values[p] = fields[i]!));
  if (values.year.length !== 4 || values.month.length > 2 || values.day.length > 2) return null;
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${values.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
