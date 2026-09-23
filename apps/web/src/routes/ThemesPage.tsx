import { SKINS } from "@kidcom/shared";

import { Card } from "../components/Card";
import { SkinPreview } from "../components/SkinPreview";
import { useHeaderConfig } from "../lib/HeaderContext";

const AURA = SKINS[0];

// Read-only info screen (v3.0 — single-theme consolidation, 2026-09-22).
// KidCom previously let a user switch between several skins here; Aura is
// now the app's only theme, so this just shows what it looks like instead
// of offering a picker with one option.
export function ThemesPage() {
  useHeaderConfig({ title: "Theme", backTo: "/preferences" }, []);

  return (
    <div className="px-container-padding pt-4 flex flex-col gap-3 pb-8">
      <Card padded={false} className="p-3">
        <div className="w-full flex items-center gap-3 text-left">
          <SkinPreview skinId={AURA.id} className="w-20 h-16" />
          <div className="flex-1 min-w-0">
            <p className="font-label-md text-label-md text-on-surface">{AURA.name}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug mt-0.5">
              Porcelain and obsidian, with sage-mint cards and a floating dock. KidCom's single,
              app-wide look.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
