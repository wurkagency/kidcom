import type { ReactNode } from "react";

import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
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
      <BottomNav />
    </div>
  );
}
