import { createContext, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { formatLocales, parseDecimal, resolveRegion, weekStartOf } from "./region";

// Every date and time in Kinnd is shown in Danish local time, whatever the
// device's timezone: custody boundaries and appointments are Copenhagen
// wall-clock times (docs/calendar_custody.md), so a parent travelling abroad
// must still see "handover 15:00", not their hotel's local time.
export const APP_TIME_ZONE = "Europe/Copenhagen";

type DateInput = Date | string | number;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

export type Formatters = {
  /** ISO 3166-1 region the formats follow ("DK") */
  region: string;
  /** First day of the week, ISO: 1 = Monday … 7 = Sunday */
  weekStart: number;
  /** e.g. "Sep 23, 2026" (en-US), "23 Sept 2026" (en-DK); all-numeric options give "23.09.2026" in DK */
  date: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  /** e.g. "15:00" / "3:00 PM" per locale */
  time: (value: DateInput) => string;
  /** e.g. "Wed, Sep 23" */
  weekdayDate: (value: DateInput) => string;
  /** e.g. "September 2026" */
  monthYear: (value: DateInput) => string;
  /** e.g. "3 hours ago" / "in 2 days" */
  relative: (value: DateInput, now?: Date) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** 0.6 → "60%" (US) / "60 %" (DK) */
  percent: (fraction: number) => string;
  /** A number typed by hand: "48,5" and "48.5" are both 48.5 */
  parseNumber: (input: string) => number;
};

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.34524],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

const TEXT_PARTS = ["weekday", "era", "dayPeriod", "timeZoneName"] as const;
/** Options that spell something out (a month name, a weekday) need the UI language. */
const hasWords = (o: Intl.DateTimeFormatOptions) =>
  o.month === "short" || o.month === "long" || o.month === "narrow" || TEXT_PARTS.some((k) => o[k] !== undefined) || o.dateStyle !== undefined;

export function createFormatters(language: string, region: string): Formatters {
  const locales = formatLocales(language, region);
  const zoned = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(hasWords(options) ? locales.text : locales.numeric, { timeZone: APP_TIME_ZONE, ...options });
  const dateFmt = zoned({ year: "numeric", month: "short", day: "numeric" });
  const timeFmt = zoned({ hour: "2-digit", minute: "2-digit" }); // "08:30 AM" (US), "08.30" (DK)
  const weekdayFmt = zoned({ weekday: "short", month: "short", day: "numeric" });
  const monthYearFmt = zoned({ month: "long", year: "numeric" });
  const rtf = new Intl.RelativeTimeFormat(locales.text, { numeric: "auto" });
  const percentFmt = new Intl.NumberFormat(locales.numeric, { style: "percent", maximumFractionDigits: 0 });

  return {
    region,
    weekStart: weekStartOf(region),
    date: (value, options) => (options ? zoned(options) : dateFmt).format(toDate(value)),
    time: (value) => timeFmt.format(toDate(value)),
    weekdayDate: (value) => weekdayFmt.format(toDate(value)),
    monthYear: (value) => monthYearFmt.format(toDate(value)),
    relative: (value, now = new Date()) => {
      let delta = (toDate(value).getTime() - now.getTime()) / 1000;
      for (const [unit, size] of RELATIVE_STEPS) {
        if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit);
        delta /= size;
      }
      return rtf.format(Math.round(delta), "year");
    },
    number: (value, options) => new Intl.NumberFormat(locales.numeric, options).format(value),
    percent: (fraction) => percentFmt.format(fraction),
    parseNumber: parseDecimal,
  };
}

/** The region formats follow; provided by <KinndApp> from the account, else the device. */
export const RegionContext = createContext<string | null>(null);

/** Formatters for the active UI language in the user's region. */
export function useFormat(): Formatters {
  const { i18n } = useTranslation();
  const region = useContext(RegionContext) ?? resolveRegion(null);
  return useMemo(() => createFormatters(i18n.language, region), [i18n.language, region]);
}
