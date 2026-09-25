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
