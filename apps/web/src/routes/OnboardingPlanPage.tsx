import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BillingPeriod, SubscribeRequest, SubscribeResponse, SubscriptionTier } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { OnboardingSegments } from "../components/OnboardingSegments";
import { apiPost, ApiRequestError } from "../lib/api";

// Matches docs/stitch_splitkid/Onboarding - Choose Your Plan/code.html — the
// 5th (final) onboarding step. Distinct copy/checklists from BillingPage.tsx
// (/billing's "subscription_management" mockup) by design — this is the
// onboarding-only version of the plan picker, with its own trial framing —
// but both call the same real POST /billing/subscribe (already 3-way
// FREE/PARENTS/FAMILY and already bypasses QuickPay outside production, see
// apps/api/src/routes/billing/index.ts), so plan switching here is genuinely
// testable in local dev, not just decorative.
type Plan = {
  tier: SubscriptionTier;
  label: string;
  blurb: string;
  monthly: number | null;
  annual: number | null;
  features: string[];
};

const PLANS: Plan[] = [
  {
    tier: "FREE",
    label: "Father / Mother",
    blurb: "For a single parent starting out.",
    monthly: null,
    annual: null,
    features: ["Manage 1 child", "Personal calendar", "Private journal & media gallery", "Personal lists & Wishlist"],
  },
  {
    tier: "PARENTS",
    label: "Parents",
    blurb: "Full access for co-parenting.",
    monthly: 29,
    annual: 275,
    features: [
      "Invite and collaborate as parents",
      "Shared custody calendar",
      "Shared journal & media gallery",
      "Manage 1 child together",
    ],
  },
  {
    tier: "FAMILY",
    label: "Family",
    blurb: "For growing, blended families.",
    monthly: 59,
    annual: 559,
    features: ["Unlimited kids", "Invite the whole family", "All Parents features included"],
  },
];

function trialEndDateLabel(): string {
  // Presentational only — this onboarding step is where a fresh account
  // would start a 30-day trial per the mockup's framing; there's no real
  // TRIALING-status billing state machine behind it yet (see plan notes), so
  // this is just today + 30 days, formatted, never a fabricated past date.
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function OnboardingPlanPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<BillingPeriod>("ANNUAL");
  const [switching, setSwitching] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectPlan(tier: SubscriptionTier) {
    setSwitching(tier);
    setError(null);
    try {
      const res = await apiPost<SubscribeResponse>("/billing/subscribe", {
        tier,
        billingPeriod: tier === "FREE" ? undefined : period,
      } satisfies SubscribeRequest);
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't switch plans — try again");
      setSwitching(null);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface pb-safe">
      <OnboardingSegments step={4} total={4} label="Final step" />

      <main className="flex-1 relative w-full pb-12">
        <div className="px-container-padding pt-4 pb-2">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-2">
            Start Your 30-Day Free Trial
          </h1>
          <p className="font-body-md text-on-surface-variant mb-4">
            Choose the plan that fits your family best. All paid features are 100% free for your first 30 days. No
            automatic charges today.
          </p>
          <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3 border border-outline-variant/40">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon name="event_available" className="text-[20px]" />
            </div>
            <div className="text-left">
              <p className="font-label-sm font-semibold text-on-surface">
                Free trial ends: <span className="text-primary">{trialEndDateLabel()}</span>
              </p>
              <p className="font-label-sm text-on-surface-variant">
                First payment only starts in 30 days. We'll remind you before it begins.
              </p>
            </div>
          </div>
        </div>

        <div className="px-container-padding flex justify-center my-6">
          <div className="bg-surface-container rounded-full p-1 flex items-center relative w-full max-w-[320px]">
            <div
              className="absolute h-10 w-1/2 bg-surface rounded-full shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: period === "ANNUAL" ? "translateX(100%)" : "translateX(0)" }}
            />
            <button
              onClick={() => setPeriod("MONTHLY")}
              className={`relative z-10 flex-1 py-2 font-label-md transition-colors duration-200 ${
                period === "MONTHLY" ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod("ANNUAL")}
              className={`relative z-10 flex-1 py-2 font-label-md transition-colors duration-200 flex items-center justify-center gap-1 ${
                period === "ANNUAL" ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              Annual
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide hidden sm:inline-block">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="px-container-padding mb-4">
            <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
          </div>
        )}

        <div className="px-container-padding flex flex-col gap-6 mb-8">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              period={period}
              busy={switching !== null}
              switching={switching === plan.tier}
              onSelect={() => handleSelectPlan(plan.tier)}
            />
          ))}
        </div>

        <div className="px-container-padding mb-6">
          <div className="bg-tertiary-fixed-dim/30 rounded-xl p-4 flex gap-4 items-start">
            <div className="bg-surface rounded-full p-2 shrink-0">
              <Icon name="card_giftcard" className="text-tertiary" />
            </div>
            <div>
              <h4 className="font-label-md text-on-tertiary-container mb-1">Invited users also get 30 days free</h4>
              <p className="font-label-sm text-on-tertiary-container/80 leading-relaxed">
                When you invite a co-parent or family member during your setup, they'll receive their own 30-day free
                trial with no payment upfront.
              </p>
            </div>
          </div>
        </div>

        <div className="px-container-padding flex flex-col items-center justify-center text-center gap-4 pb-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="font-headline-md text-primary font-semibold inline-flex items-center gap-1.5 hover:underline py-2"
          >
            Skip for now <Icon name="arrow_forward" className="text-[20px]" />
          </button>
          <p className="font-label-sm text-on-surface-variant max-w-[280px]">
            You can explore with the free plan and upgrade anytime from Settings.
          </p>
        </div>
      </main>
    </div>
  );
}

function PlanCard({
  plan,
  period,
  busy,
  switching,
  onSelect,
}: {
  plan: Plan;
  period: BillingPeriod;
  busy: boolean;
  switching: boolean;
  onSelect: () => void;
}) {
  const price = period === "MONTHLY" ? plan.monthly : plan.annual;
  const savings = plan.monthly != null && plan.annual != null ? plan.monthly * 12 - plan.annual : null;

  if (plan.tier === "PARENTS") {
    return (
      <div className="bg-surface rounded-xl p-6 shadow-[0_8px_30px_rgba(50,105,67,0.08)] relative overflow-hidden ring-2 ring-primary">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none" />
        <div className="absolute top-0 right-6 bg-primary text-on-primary px-3 py-1 rounded-b-lg font-label-sm shadow-sm">
          Recommended
        </div>
        <div className="flex justify-between items-start mb-4 mt-2">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">{plan.label}</h3>
            <p className="font-body-md text-on-surface-variant">{plan.blurb}</p>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="font-display-lg text-display-lg text-on-surface">{price}</span>
              <span className="font-label-sm text-on-surface-variant">{period === "MONTHLY" ? "kr/mo" : "kr/yr"}</span>
            </div>
            {period === "ANNUAL" && savings != null && (
              <span className="font-label-sm text-primary">Saves {savings} kr/yr</span>
            )}
          </div>
        </div>
        <button
          onClick={onSelect}
          disabled={busy}
          className="w-full py-3.5 px-4 bg-primary text-on-primary rounded-full font-label-md mb-6 shadow-md shadow-primary/20 transition-transform active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Icon name="lock_open" className="text-[18px]" />
          {switching ? "Subscribing…" : "Subscribe"}
        </button>
        <FeatureList features={plan.features} iconClass="text-primary" />
      </div>
    );
  }

  if (plan.tier === "FAMILY") {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_20px_rgba(50,105,67,0.04)] relative">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">{plan.label}</h3>
            <p className="font-body-md text-on-surface-variant">{plan.blurb}</p>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="font-display-lg text-display-lg text-on-surface">{price}</span>
              <span className="font-label-sm text-on-surface-variant">{period === "MONTHLY" ? "kr/mo" : "kr/yr"}</span>
            </div>
            {period === "ANNUAL" && savings != null && (
              <span className="font-label-sm text-primary">Saves {savings} kr/yr</span>
            )}
          </div>
        </div>
        <button
          onClick={onSelect}
          disabled={busy}
          className="w-full py-3 px-4 bg-secondary text-on-secondary rounded-full font-label-md mb-6 shadow-sm shadow-secondary/10 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {switching ? "Subscribing…" : "Subscribe"}
        </button>
        <FeatureList features={plan.features} iconClass="text-secondary" />
      </div>
    );
  }

  // FREE
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_20px_rgba(50,105,67,0.04)] relative">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">{plan.label}</h3>
          <p className="font-body-md text-on-surface-variant">{plan.blurb}</p>
        </div>
        <div className="text-right">
          <span className="font-display-lg text-display-lg text-on-surface">Free</span>
        </div>
      </div>
      <button
        onClick={onSelect}
        disabled={busy}
        className="w-full py-3 px-4 bg-surface-container hover:bg-surface-variant rounded-full font-label-md text-on-surface mb-6 transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {switching ? "Switching…" : "Choose for free"}
      </button>
      <FeatureList features={plan.features} iconClass="text-outline-variant" />
    </div>
  );
}

function FeatureList({ features, iconClass }: { features: string[]; iconClass: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-3">
          <Icon name="check_circle" className={`${iconClass} shrink-0`} />
          <span className="font-body-md text-on-surface">{feature}</span>
        </li>
      ))}
    </ul>
  );
}
