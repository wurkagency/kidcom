import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "@kidcom/shared";

import type { ThemeManifest } from "./manifest";

export type ThemeRegistry = Record<ThemeId, () => Promise<{ default: ThemeManifest }>>;

const STORAGE_KEY = "kidcom.themeId";

/**
 * The theme to paint before the signed-in user's preference is known —
 * the last one applied on this device, else the code-level default.
 */
export function readCachedThemeId(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function cacheThemeId(id: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode) — the theme still applies, it just
    // won't be pre-painted on the next cold start.
  }
}

const loaded = new Map<ThemeId, ThemeManifest>();

async function loadTheme(registry: ThemeRegistry, id: ThemeId): Promise<ThemeManifest> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const manifest = (await registry[id]()).default;
  loaded.set(id, manifest);
  return manifest;
}

function applyToDocument(manifest: ThemeManifest) {
  const root = document.documentElement;
  root.dataset.theme = manifest.id;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = manifest.meta.themeColor;
}

type ThemeContextValue = { theme: ThemeManifest };
const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  registry: ThemeRegistry;
  /** Resolved theme id (user preference ?? cached ?? default). */
  themeId: ThemeId;
  /** Shown only until the very first theme has loaded. */
  fallback: ReactNode;
  children: ReactNode;
};

/**
 * Loads and applies the active theme. Switching is instant and reload-free:
 * the previous theme stays mounted until the next one's code has loaded,
 * then `data-theme` flips and every screen re-renders from the new manifest.
 */
export function ThemeProvider({ registry, themeId, fallback, children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeManifest | null>(() => loaded.get(themeId) ?? null);

  useEffect(() => {
    let cancelled = false;
    loadTheme(registry, themeId).then(
      (manifest) => {
        if (cancelled) return;
        applyToDocument(manifest);
        cacheThemeId(manifest.id);
        setTheme(manifest);
      },
      (error: unknown) => {
        // A theme that fails to load must never leave the app blank: fall
        // back to the default theme unless that is what just failed.
        console.error(`Failed to load theme "${themeId}"`, error);
        if (!cancelled && themeId !== DEFAULT_THEME_ID) {
          loadTheme(registry, DEFAULT_THEME_ID).then((manifest) => {
            if (cancelled) return;
            applyToDocument(manifest);
            setTheme(manifest);
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [registry, themeId]);

  if (!theme) return <>{fallback}</>;
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeManifest {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx.theme;
}
