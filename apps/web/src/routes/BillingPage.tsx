import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BillingPeriod, SubscribeRequest, SubscribeResponse, SubscriptionDto, SubscriptionTier } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

// Matches docs/stitch_splitkid/subscription_management/code.html: a Free
// tier ("Father / Mother") plus Parents (Recommended) and Family, a sliding
// Monthly/Annual toggle, a trial-info banner, and an FAQ teaser (left inert —
// no FAQ content exists yet).
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
    features: ["Basic child management (1 child)", "Personal calendar", "Private journal entries"],
  },
  {
    tier: "PARENTS",
    label: "Parents",
    blurb: "Full access for co-parenting.",
    monthly: 29,
    annual: 275,
    features: [
      "Invite the other parent",
      "Shared custody calendar",
      "Shared journal & media gallery",
      "Unlimited child profiles",
    ],
  },
  {
    tier: "FAMILY",
    label: "Family",
    blurb: "For growing, blended families.",
    monthly: 59,
    annual: 559,
    features: ["Unlimited kids", "Invite extended family (grandparents, etc.)", "All Parents features included"],
  },
];

const STATUS_LABEL: Record<SubscriptionDto["status"], string> = {
  TRIALING: "Trial",
  PENDING: "Upgrade pending",
  ACTIVE: "Active",
  PAST_DUE: "Payment past due",
  CANCELED: "Canceled",
};

export function BillingPage() {
  useHeaderConfig({ title: "Subscription", backTo: "/profile" }, []);

  const [searchParams] = useSearchParams();
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("ANNUAL");
  const [switching, setSwitching] = useState<SubscriptionTier | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const pollCount = useRef(0);

  async function load() {
    try {
      const res = await apiGet<SubscriptionDto>("/billing/status");
      setSub(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load your subscription");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Coming back from QuickPay's checkout — the webhook may take a moment to
  // land, so poll a handful of times rather than assuming it's already
  // reflected.
  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    const interval = setInterval(() => {
      pollCount.current += 1;
      load();
      if (pollCount.current >= 5) clearInterval(interval);
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const checkoutCancelled = searchParams.get("checkout") === "cancel";

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
      // Switched directly (Free tier, or a non-production paid-tier switch) —
      // no page leave, just reflect the new state.
      await load();
      setSwitching(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't switch plans — try again");
      setSwitching(null);
    }
  }

  async function handleCancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setCanceling(true);
    setError(null);
    try {
      const res = await apiPost<SubscriptionDto>("/billing/cancel");
      setSub(res);
      setConfirmCancel(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't cancel — try again");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="flex flex-col w-full pb-8">
      <div className="px-container-padding pt-6 pb-4 flex flex-col gap-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Choose Your Plan</h1>
        <p className="font-body-md text-on-surface-variant">
          Simple, transparent pricing to support your family's journey. No hidden fees.
        </p>
      </div>

      <div className="px-container-padding flex flex-col gap-section-margin">
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
        )}
        {checkoutCancelled && (
          <p className="font-body-md text-body-md text-on-surface-variant bg-surface-container rounded-lg px-4 py-3">
            Checkout was cancelled — your plan hasn't changed.
          </p>
        )}
        {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}

        {sub && (
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-headline-md text-headline-md text-on-surface capitalize">
                {sub.tier.toLowerCase()}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{STATUS_LABEL[sub.status]}</span>
            </div>
            {sub.tier === "FREE" &&
              (sub.trialExpired ? (
                <p className="font-body-md text-body-md text-error">Trial expired</p>
              ) : (
                sub.trialEndsAt && (
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Trial ends {new Date(sub.trialEndsAt).toLocaleDateString()}
                  </p>
                )
              ))}
            {sub.currentPeriodEnd && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            {(sub.status === "ACTIVE" || sub.status === "PAST_DUE") && sub.tier !== "FREE" && (
              <div className="pt-2">
                <button
                  onClick={handleCancel}
                  disabled={canceling}
                  className="font-label-sm text-label-sm text-error disabled:opacity-60"
                >
                  {canceling
                    ? "Cancelling…"
                    : confirmCancel
                      ? "Are you sure? Tap again to confirm"
                      : "Cancel subscription"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center">
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
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              period={period}
              isCurrent={sub?.tier === plan.tier}
              busy={switching !== null}
              switching={switching === plan.tier}
              onSelect={() => handleSelectPlan(plan.tier)}
            />
          ))}
        </div>

        <div className="bg-tertiary-fixed-dim/30 rounded-xl p-4 flex gap-4 items-start">
          <div className="bg-surface rounded-full p-2 shrink-0">
            <Icon name="card_giftcard" className="text-tertiary" />
          </div>
          <div>
            <h4 className="font-label-md text-on-tertiary-container mb-1">Invited users get 30 days free</h4>
            <p className="font-label-sm text-on-tertiary-container/80 leading-relaxed">
              When you invite a co-parent or family member, they'll receive a 30-day free trial with full access to
              every feature — including adding multiple children — so they can see what fits before choosing a plan.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center text-center pb-4">
          <p className="font-body-md text-on-surface-variant mb-2">Have questions about our plans?</p>
          <span className="text-primary font-label-md flex items-center gap-1">
            Read our FAQ <Icon name="arrow_forward" className="text-[16px]" />
          </span>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  period,
  isCurrent,
  busy,
  switching,
  onSelect,
}: {
  plan: Plan;
  period: BillingPeriod;
  isCurrent: boolean;
  busy: boolean;
  switching: boolean;
  onSelect: () => void;
}) {
  const price = period === "MONTHLY" ? plan.monthly : plan.annual;
  const savings = plan.monthly != null && plan.annual != null ? plan.monthly * 12 - plan.annual : null;

  const buttonLabel = isCurrent ? "Current Plan" : switching ? "Switching…" : plan.tier === "FREE" ? "Switch to Free" : "Upgrade Plan";

  if (plan.tier === "PARENTS") {
    return (
      <div className="bg-surface-beige rounded-xl p-6 shadow-[0_8px_30px_rgba(50,105,67,0.08)] relative overflow-hidden ring-1 ring-primary/20">
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
          disabled={busy || isCurrent}
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-full font-label-md mb-6 shadow-md shadow-primary/20 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {buttonLabel}
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
          disabled={busy || isCurrent}
          className="w-full py-3 px-4 bg-secondary text-on-secondary rounded-full font-label-md mb-6 shadow-sm shadow-secondary/10 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {buttonLabel}
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
        disabled={busy || isCurrent}
        className="w-full py-3 px-4 bg-surface-container rounded-full font-label-md text-on-surface-variant mb-6 transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {buttonLabel}
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
