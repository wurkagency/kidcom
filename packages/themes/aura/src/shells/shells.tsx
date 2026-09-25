import type { ShellProps } from "@kinnd/theme-kit";

import { Link, paths, useBillingStatus, useFormat, useT } from "@kinnd/core";

import { Icon } from "../components/Icon";
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
        <TrialBanner />
        <div className="flex flex-col w-full">{children}</div>
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

/**
 * D3: during a free trial its end date is always visible in the app, not
 * only on the plan page — with "Add card" until one is on file.
 */
function TrialBanner() {
  const { t } = useT("billing");
  const fmt = useFormat();
  const { data: sub } = useBillingStatus();
  if (sub?.status !== "TRIALING" || !sub.trialEndsAt || sub.circle?.role !== "OWNER") return null;
  return (
    <Link
      to={paths.billing.overview()}
      className="mb-3 flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-peach text-on-surface font-label-sm text-label-sm"
    >
      <Icon name="event" className="text-[16px]" />
      {t(sub.cardOnFile ? "trialPill" : "trialPillNoCard", { date: fmt.date(sub.trialEndsAt, { day: "2-digit", month: "2-digit", year: "numeric" }) })}
    </Link>
  );
}
