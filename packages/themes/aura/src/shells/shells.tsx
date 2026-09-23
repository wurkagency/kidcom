import type { ShellProps } from "@kidcom/theme-kit";

import { Toaster } from "../ui/sonner";
import { AppHeader } from "./AppHeader";
import { Dock } from "./Dock";

// Aura's four shells. Structure and classes of the app shell are the
// 000_base_scaffold export's <header>, <main> and dock, unchanged.

/** Tab and detail screens: fixed header + dock around a padded main column. */
export function AppShell({ children }: ShellProps) {
  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <AppHeader />
      <main className="flex flex-col relative w-full pt-20 pb-28 bg-surface px-margin">
        <div className="flex flex-col w-full pb-28">{children}</div>
      </main>
      <Dock />
      <Toaster />
    </div>
  );
}

/** Pre-app flows (phone verification, onboarding): no header or dock. */
export function StackShell({ children }: ShellProps) {
  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe">
      <main className="flex flex-col relative w-full flex-1 px-margin">{children}</main>
      <Toaster />
    </div>
  );
}

/** Signed-out flows; each auth screen owns its full-bleed layout. */
export function AuthShell({ children }: ShellProps) {
  return (
    <div className="bg-surface font-body-md text-on-surface min-h-screen">
      {children}
      <Toaster />
    </div>
  );
}

/** No chrome at all: media viewer, desktop gate, not found. */
export function BlankShell({ children }: ShellProps) {
  return <div className="min-h-screen bg-surface font-body-md text-on-surface">{children}</div>;
}
