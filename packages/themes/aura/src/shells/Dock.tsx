import { useState } from "react";
import type { ScreenId } from "@kidcom/theme-kit";
import { Link, paths, useCurrentScreen, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { QuickActionSheet } from "./QuickActionSheet";

// The one bottom dock (docs/design/aura/000_base_scaffold): obsidian pill
// with four tabs + the mint Quick Action button.

type Tab = { key: "today" | "calendar" | "moments" | "lists"; icon: string; to: string; owns: (s: ScreenId) => boolean };

const TABS: Tab[] = [
  { key: "today", icon: "sunny", to: paths.today(), owns: (s) => s === "today" },
  { key: "calendar", icon: "calendar_today", to: paths.calendar.agenda(), owns: (s) => s.startsWith("calendar.") },
  {
    key: "moments",
    icon: "photo_library",
    to: paths.moments.feed(),
    owns: (s) => s.startsWith("moments.") || s.startsWith("media.") || s === "bookmarks",
  },
  { key: "lists", icon: "checklist", to: paths.lists.overview(), owns: (s) => s.startsWith("lists.") },
];

export function Dock() {
  const { t } = useT("shell");
  const screen = useCurrentScreen();
  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <div className="fixed bottom-0 w-full z-50 pb-safe pointer-events-none">
      <div className="px-margin pb-space-md flex items-center justify-center gap-space-sm">
        <nav
          aria-label={t("dock.label")}
          className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)] backdrop-blur-xl"
        >
          {TABS.map((tab) => {
            const active = tab.owns(screen);
            return (
              <Link
                key={tab.key}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[58px] h-10 px-2 rounded-full transition-all",
                  active
                    ? "text-on-primary bg-on-primary/15 font-label-md"
                    : "text-on-primary-container hover:text-on-primary",
                )}
              >
                <Icon name={tab.icon} className="text-[18px]" />
                <span className="font-micro-meta text-micro-meta uppercase tracking-wider mt-0.5">{t(`dock.${tab.key}`)}</span>
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          aria-label={t("dock.quickAction")}
          aria-haspopup="dialog"
          onClick={() => setQuickOpen(true)}
          className="pointer-events-auto flex items-center justify-center rounded-full bg-secondary-container text-on-secondary-fixed shadow-[0_8px_24px_-4px_rgba(22,26,24,0.12)] hover:scale-105 active:scale-95 transition-all shrink-0"
          style={{ width: 62, height: 62 }}
        >
          <Icon name="add" className="text-[26px]" />
        </button>
      </div>
      <QuickActionSheet open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}
