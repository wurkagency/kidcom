// Per-user presentation preferences shared by apps/api (validates PATCH
// /auth/me) and the web app (applies them). Both catalogues are fixed and
// code-level: the DB stores a nullable id and the app resolves
// `user.themeId ?? DEFAULT_THEME_ID` / `user.locale ?? DEFAULT_LOCALE`.

// Theme catalogue. The theme implementations live in packages/themes/<id>;
// this list is only the ids the server accepts.
export const THEME_IDS = ["aura"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME_ID: ThemeId = "aura";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

// Locales with a translation catalogue. en-US is the source language; the
// others are scaffolded for machine translation and only become selectable
// once listed in ENABLED_LOCALES.
export const SUPPORTED_LOCALES = ["en-US", "da-DK", "nb-NO", "sv-SE"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const ENABLED_LOCALES: readonly Locale[] = ["en-US"];
export const DEFAULT_LOCALE: Locale = "en-US";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
