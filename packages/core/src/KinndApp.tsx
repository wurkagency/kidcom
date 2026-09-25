import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { isThemeId } from "@kinnd/shared";
import { ThemeProvider, readCachedThemeId, useTheme, type ThemeRegistry } from "@kinnd/theme-kit";

import { configureApi } from "./api/client";
import { createQueryClient } from "./api/queryClient";
import { useMe } from "./auth/hooks";
import { ActiveChildrenProvider } from "./children/ActiveChildren";
import { useDesktopGate, type DesktopGate } from "./device/desktopGate";
import { RegionContext } from "./i18n/format";
import { applyLocale, createI18n } from "./i18n/i18n";
import { resolveRegion } from "./i18n/region";
import { AppRouter } from "./routing/AppRouter";
import { CurrentScreenContext } from "./routing/currentScreen";

const DesktopGateContext = createContext<DesktopGate | null>(null);

/** For the theme's system.desktopGate screen: the handoff URL and "continue anyway". */
export function useDesktopGateState(): DesktopGate {
  const ctx = useContext(DesktopGateContext);
  if (!ctx) throw new Error("useDesktopGateState used outside <KinndApp>");
  return ctx;
}

/** Keeps the UI language in step with the signed-in user's preference. */
function LocaleSync({ i18n }: { i18n: ReturnType<typeof createI18n> }) {
  const { data: me } = useMe();
  useEffect(() => {
    void applyLocale(i18n, me?.locale);
  }, [i18n, me?.locale]);
  return null;
}

/** Formats follow the account's country, else the device's (see i18n/region.ts). */
function RegionSync({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [detected] = useState(() => resolveRegion(null));
  return <RegionContext.Provider value={me?.region ?? detected}>{children}</RegionContext.Provider>;
}

function GatedApp() {
  const theme = useTheme();
  const gate = useDesktopGate();
  if (gate.active) {
    const Blank = theme.shells.blank;
    const Gate = theme.screens["system.desktopGate"];
    return (
      <DesktopGateContext.Provider value={gate}>
        <CurrentScreenContext.Provider value="system.desktopGate">
          <Blank screen="system.desktopGate">
            <Gate />
          </Blank>
        </CurrentScreenContext.Provider>
      </DesktopGateContext.Provider>
    );
  }
  return (
    <ActiveChildrenProvider>
      <AppRouter />
    </ActiveChildrenProvider>
  );
}

function ThemedApp({ registry, splash }: { registry: ThemeRegistry; splash: ReactNode }) {
  const { data: me } = useMe();
  // Paint the device's last theme immediately; switch once the account's
  // own preference is known (instant, no reload).
  const themeId = isThemeId(me?.themeId) ? me.themeId : readCachedThemeId();
  return (
    <ThemeProvider registry={registry} themeId={themeId} fallback={splash}>
      <GatedApp />
    </ThemeProvider>
  );
}

type KinndAppProps = {
  /** Every installed theme, lazily imported. */
  registry: ThemeRegistry;
  /** API origin; "/api" in dev (Vite proxy). */
  apiBaseUrl: string;
  /** Theme-independent splash shown until the first theme has loaded. */
  splash: ReactNode;
};

export function KinndApp({ registry, apiBaseUrl, splash }: KinndAppProps) {
  const [{ queryClient, i18n }] = useState(() => {
    configureApi({ baseUrl: apiBaseUrl });
    return { queryClient: createQueryClient(), i18n: createI18n() };
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <LocaleSync i18n={i18n} />
        <RegionSync>
          <ThemedApp registry={registry} splash={splash} />
        </RegionSync>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
