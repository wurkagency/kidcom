import type { ReactNode } from "react";

import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { QuickAddButton } from "./QuickAddButton";
import { HeaderProvider } from "../lib/HeaderContext";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <HeaderProvider>
        <main className="flex-1 relative w-full pt-safe pb-24 bg-surface">
          <Header />
          {children}
        </main>
      </HeaderProvider>
      {/* BottomNav owns its own shape/color (skin-driven); this row owns
          where the pair of them sits and the gap between them, so the
          floating add button reads as "beside the nav" on every skin,
          not just Aura's mockups it was drawn from. */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3"
        style={{
          paddingLeft: "var(--nav-inset-x)",
          paddingRight: "var(--nav-inset-x)",
          paddingBottom: "calc(var(--nav-inset-bottom) + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <BottomNav />
        <QuickAddButton />
      </div>
    </div>
  );
}
