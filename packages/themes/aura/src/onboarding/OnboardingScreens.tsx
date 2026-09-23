import type { ReactNode } from "react";
import { Link, paths, useCurrentUser, useNavigate, useT } from "@kidcom/core";

import { CheckoutForm } from "../billing/BillingScreens";
import { ChildForm } from "../children/ChildEditScreen";
import { InviteForm } from "../children/InviteScreen";
import { cn } from "../lib/utils";

// First run (no Stitch export; DESIGN.md parts): someone with no children
// yet adds one, invites the other parent or family, and picks a plan. Each
// later step can be skipped.

const STEPS = ["child", "invite", "plan"] as const;

function Step({ step, title, intro, children }: { step: (typeof STEPS)[number]; title: string; intro: string; children: ReactNode }) {
  const { t } = useT("onboarding");
  const at = STEPS.indexOf(step);
  return (
    <div className="flex flex-col w-full pb-10 gap-space-lg pt-4">
      <div className="flex items-center gap-2" aria-label={t("progress", { step: at + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= at ? "bg-primary" : "bg-surface-container-high")} />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{title}</h1>
        <p className="font-body-md text-body-md text-secondary">{intro}</p>
      </div>
      {children}
    </div>
  );
}

function Skip({ to }: { to: string }) {
  const { t } = useT("onboarding");
  return (
    <Link to={to} replace className="self-center font-label-md text-label-md text-secondary underline underline-offset-4">
      {t("skip")}
    </Link>
  );
}

export function OnboardingChildScreen() {
  const { t } = useT("onboarding");
  const me = useCurrentUser();
  const navigate = useNavigate();
  return (
    <Step step="child" title={t("child.title", { name: me.firstName })} intro={t("child.intro")}>
      <ChildForm hideTitle onCreated={() => navigate(paths.onboarding.invite(), { replace: true })} />
    </Step>
  );
}

export function OnboardingInviteScreen() {
  const { t } = useT("onboarding");
  const navigate = useNavigate();
  return (
    <Step step="invite" title={t("invite.title")} intro={t("invite.intro")}>
      <InviteForm hideTitle onDone={() => navigate(paths.onboarding.plan(), { replace: true })} footer={<Skip to={paths.onboarding.plan()} />} />
    </Step>
  );
}

export function OnboardingPlanScreen() {
  const { t } = useT("onboarding");
  const navigate = useNavigate();
  return (
    <Step step="plan" title={t("plan.title")} intro={t("plan.intro")}>
      <CheckoutForm onFree={() => navigate(paths.today(), { replace: true })} />
      <Skip to={paths.today()} />
    </Step>
  );
}
