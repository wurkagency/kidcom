// Device-local app preferences — same storage pattern as the existing
// install-prompt-shown flag (apps/web/src/components/InstallPrompt.tsx):
// per-device display settings, not account data, so no backend field.
//
// Units and Start of Week are read elsewhere today (Growth's stat
// cards/chart/logs, Calendar's week-start). The rest (theme, text size,
// language, date format, time zone, calendar default view, two-factor,
// biometric, journal visibility, location/photo permissions) are stored for
// real so their controls on App Preferences / Privacy & Security are fully
// interactive and persist across visits, even though nothing else in the
// app reads them yet — "functions are embedded later" per Charlie's
// instruction, not "these are decorative."
import { applySkin, DEFAULT_SKIN, SKINS, type SkinId } from "./themes";

export type UnitSystem = "metric" | "imperial";
export type WeekStart = "sunday" | "monday";
export type Theme = "light" | "dark";
export type TextSize = "small" | "standard" | "large";
export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type CalendarDefaultView = "month" | "week";
export type JournalVisibility = "shared" | "private";

function getString<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function setString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort — a private window or blocked storage just keeps the default
  }
}

function getBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function setBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // best-effort
  }
}

const UNITS_KEY = "kidcom-units";
const WEEK_START_KEY = "kidcom-week-start";
const THEME_KEY = "kidcom-theme";
const SKIN_KEY = "kidcom-skin";
const TEXT_SIZE_KEY = "kidcom-text-size";
const LANGUAGE_KEY = "kidcom-language";
const DATE_FORMAT_KEY = "kidcom-date-format";
const TIME_ZONE_KEY = "kidcom-time-zone";
const CALENDAR_DEFAULT_VIEW_KEY = "kidcom-calendar-default-view";
const TWO_FACTOR_KEY = "kidcom-two-factor";
const BIOMETRIC_LOGIN_KEY = "kidcom-biometric-login";
const JOURNAL_VISIBILITY_KEY = "kidcom-journal-visibility";
const LOCATION_ACCESS_KEY = "kidcom-location-access";
const PHOTO_LIBRARY_ACCESS_KEY = "kidcom-photo-library-access";

export function getUnitSystem(): UnitSystem {
  return getString(UNITS_KEY, ["metric", "imperial"], "metric");
}
export function setUnitSystem(value: UnitSystem) {
  setString(UNITS_KEY, value);
}

export function getWeekStart(): WeekStart {
  return getString(WEEK_START_KEY, ["sunday", "monday"], "monday");
}
export function setWeekStart(value: WeekStart) {
  setString(WEEK_START_KEY, value);
}

export function getSkin(): SkinId {
  return getString(
    SKIN_KEY,
    SKINS.map((skin) => skin.id),
    DEFAULT_SKIN
  );
}
export function setSkin(value: SkinId) {
  setString(SKIN_KEY, value);
  applySkin(value);
}

export function getTheme(): Theme {
  return getString(THEME_KEY, ["light", "dark"], "light");
}
export function setTheme(value: Theme) {
  setString(THEME_KEY, value);
}

export function getTextSize(): TextSize {
  return getString(TEXT_SIZE_KEY, ["small", "standard", "large"], "standard");
}
export function setTextSize(value: TextSize) {
  setString(TEXT_SIZE_KEY, value);
}

export function getLanguage(): string {
  try {
    return localStorage.getItem(LANGUAGE_KEY) ?? "English (US)";
  } catch {
    return "English (US)";
  }
}
export function setLanguage(value: string) {
  setString(LANGUAGE_KEY, value);
}

export function getDateFormat(): DateFormat {
  return getString(DATE_FORMAT_KEY, ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"], "MM/DD/YYYY");
}
export function setDateFormat(value: DateFormat) {
  setString(DATE_FORMAT_KEY, value);
}

export function getTimeZone(): string {
  try {
    const stored = localStorage.getItem(TIME_ZONE_KEY);
    if (stored) return stored;
  } catch {
    // fall through to device default
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
export function setTimeZone(value: string) {
  setString(TIME_ZONE_KEY, value);
}

export function getCalendarDefaultView(): CalendarDefaultView {
  return getString(CALENDAR_DEFAULT_VIEW_KEY, ["month", "week"], "month");
}
export function setCalendarDefaultView(value: CalendarDefaultView) {
  setString(CALENDAR_DEFAULT_VIEW_KEY, value);
}

export function getTwoFactorEnabled(): boolean {
  return getBool(TWO_FACTOR_KEY, true);
}
export function setTwoFactorEnabled(value: boolean) {
  setBool(TWO_FACTOR_KEY, value);
}

export function getBiometricLoginEnabled(): boolean {
  return getBool(BIOMETRIC_LOGIN_KEY, true);
}
export function setBiometricLoginEnabled(value: boolean) {
  setBool(BIOMETRIC_LOGIN_KEY, value);
}

export function getJournalVisibility(): JournalVisibility {
  return getString(JOURNAL_VISIBILITY_KEY, ["shared", "private"], "shared");
}
export function setJournalVisibility(value: JournalVisibility) {
  setString(JOURNAL_VISIBILITY_KEY, value);
}

export function getLocationAccess(): boolean {
  return getBool(LOCATION_ACCESS_KEY, false);
}
export function setLocationAccess(value: boolean) {
  setBool(LOCATION_ACCESS_KEY, value);
}

export function getPhotoLibraryAccess(): boolean {
  return getBool(PHOTO_LIBRARY_ACCESS_KEY, true);
}
export function setPhotoLibraryAccess(value: boolean) {
  setBool(PHOTO_LIBRARY_ACCESS_KEY, value);
}

// cm -> "5'7"" style / kg -> lbs, display-only — stored values in the DB
// always stay metric.
export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === "metric") return `${cm} cm`;
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  return `${feet}'${inches}"`;
}

export function formatWeight(kg: number, units: UnitSystem): string {
  if (units === "metric") return `${kg} kg`;
  return `${(kg * 2.20462).toFixed(1)} lbs`;
}
