import { useState } from "react";
import type { SkinId } from "@kidcom/shared";

import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { SkinPreview } from "../components/SkinPreview";
import { ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";
import { useSkin } from "../lib/SkinContext";
import { SKINS } from "../lib/themes";

// Short, purely descriptive taglines for the picker below — cosmetic only,
// so a skin added to SKINS (packages/shared/src/skins.ts) without an entry
// here just shows no tagline rather than breaking.
const TAGLINES: Partial<Record<SkinId, string>> = {
  greenkeeper: "The original KidCom look — warm greens, soft cards.",
  sky: "Airy and travel-inspired, with a floating pill nav.",
  architecture: "Quiet, Danish-functionalist calm — spruce and clay tones.",
  aura: "Porcelain and obsidian, with sage-mint cards and a floating dock.",
};

// Replaces the old plain-text /preferences/skin list (SettingsChoicePage)
// with live previews (SkinPreview.tsx) of each skin's actual tokens, so
// switching is an informed choice rather than a name in a list. Reachable
// from Profile > App Settings > Themes (AppPreferencesPage.tsx's "Theme"
// row, formerly the light/dark switcher — see that file for why it was
// replaced rather than kept alongside this).
export function ThemesPage() {
  useHeaderConfig({ title: "Themes", backTo: "/preferences" }, []);
  const { skin, setSkin } = useSkin();
  const [pending, setPending] = useState<SkinId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function activate(id: SkinId) {
    if (id === skin || pending) return;
    setPending(id);
    setError(null);
    try {
      await setSkin(id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't switch themes");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="px-container-padding pt-4 flex flex-col gap-3 pb-8">
      {error && <p className="font-body-sm text-body-sm text-error px-1">{error}</p>}
      {SKINS.map((option) => {
        const isActive = option.id === skin;
        return (
          <Card key={option.id} padded={false} className="p-3">
            <button
              type="button"
              onClick={() => activate(option.id)}
              disabled={pending !== null}
              className="w-full flex items-center gap-3 text-left disabled:opacity-60"
            >
              <SkinPreview skinId={option.id} className="w-20 h-16" />
              <div className="flex-1 min-w-0">
                <p className="font-label-md text-label-md text-on-surface">{option.name}</p>
                {TAGLINES[option.id] && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug mt-0.5">
                    {TAGLINES[option.id]}
                  </p>
                )}
              </div>
              <div className="shrink-0 w-6 flex items-center justify-center">
                {pending === option.id ? (
                  <Icon name="progress_activity" className="text-on-surface-variant animate-spin" />
                ) : isActive ? (
                  <Icon name="check_circle" className="text-primary" aria-label="Active" />
                ) : null}
              </div>
            </button>
          </Card>
        );
      })}
    </div>
  );
}
