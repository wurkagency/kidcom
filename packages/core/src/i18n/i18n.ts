import i18next, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@kinnd/shared";

// Translation catalogues live in packages/core/locales/<locale>/<namespace>.json.
// en-US is the source language and is bundled; other locales are separate
// chunks loaded on demand. A key missing from a locale falls back to en-US,
// so a partially translated locale is never blank.
const sourceCatalogue = import.meta.glob<Record<string, unknown>>("../../locales/en-US/*.json", {
  eager: true,
  import: "default",
});
const lazyCatalogues = import.meta.glob<Record<string, unknown>>("../../locales/*/*.json", { import: "default" });

function namespaceOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1, -".json".length);
}

export const NAMESPACES = Object.keys(sourceCatalogue).map(namespaceOf);

const loadedLocales = new Set<Locale>([DEFAULT_LOCALE]);

async function loadLocale(instance: I18n, locale: Locale) {
  if (loadedLocales.has(locale)) return;
  const entries = Object.entries(lazyCatalogues).filter(([path]) => path.includes(`/locales/${locale}/`));
  await Promise.all(
    entries.map(async ([path, load]) => {
      instance.addResourceBundle(locale, namespaceOf(path), await load(), true, true);
    }),
  );
  loadedLocales.add(locale);
}

export function createI18n(): I18n {
  const instance = i18next.createInstance();
  const resources = {
    [DEFAULT_LOCALE]: Object.fromEntries(Object.entries(sourceCatalogue).map(([p, bundle]) => [namespaceOf(p), bundle])),
  };
  void instance.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    ns: NAMESPACES,
    defaultNS: "common",
    interpolation: { escapeValue: false }, // React escapes already
    returnNull: false,
    initAsync: false,
  });
  return instance;
}

/** Switches the UI language, loading its catalogue first. */
export async function applyLocale(instance: I18n, locale: string | null | undefined) {
  const next: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  await loadLocale(instance, next);
  if (instance.language !== next) await instance.changeLanguage(next);
  document.documentElement.lang = next;
}
