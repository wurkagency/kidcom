import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BillingPeriod, SubscribeRequest, SubscribeResponse, SubscriptionDto, SubscriptionTier } from "@kidcom/shared";

import { apiGet, apiPost, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

// No Stitch mockup exists for this screen — built from the PRD pricing
// section (0 / 29-275 / 59-559 DKK) on the existing Kindred Path tokens.
const PLANS: { tier: Extract<SubscriptionTier, "PARENTS" | "FAMILY">; label: string; blurb: string; monthly: number; annual: number }[] = [
  { tier: "PARENTS", label: "Parents", blurb: "Full access for 1 child, invites the other parent free", monthly: 29, annual: 275 },
  { tier: "FAMILY", label: "Family", blurb: "Unlimited children, invites extended family free", monthly: 59, annual: 559 },
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
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");
  const [upgrading, setUpgrading] = useState<string | null>(null);
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

  async function handleUpgrade(tier: Extract<SubscriptionTier, "PARENTS" | "FAMILY">) {
    setUpgrading(tier);
    setError(null);
    try {
      const res = await apiPost<SubscribeResponse>("/billing/subscribe", {
        tier,
        billingPeriod: period,
      } satisfies SubscribeRequest);
      window.location.href = res.redirectUrl;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't start checkout — try again");
      setUpgrading(null);
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
    <section className="px-container-padding pt-6 flex flex-col gap-section-margin pb-8">
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
          {(sub.status === "ACTIVE" || sub.status === "PAST_DUE") && (
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

      <div className="flex bg-surface-container rounded-full p-1 self-start">
        {(["MONTHLY", "ANNUAL"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`font-label-sm text-label-sm py-2 px-4 rounded-full ${
              period === p ? "bg-primary text-on-primary" : "text-on-surface-variant"
            }`}
          >
            {p === "MONTHLY" ? "Monthly" : "Annual (save 20%)"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {PLANS.map((plan) => (
          <div key={plan.tier} className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-headline-md text-headline-md text-on-surface">{plan.label}</span>
              <span className="font-label-md text-label-md text-on-surface">
                {period === "MONTHLY" ? plan.monthly : plan.annual} DKK
                <span className="text-on-surface-variant"> /{period === "MONTHLY" ? "mo" : "yr"}</span>
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">{plan.blurb}</p>
            <button
              onClick={() => handleUpgrade(plan.tier)}
              disabled={upgrading !== null || sub?.tier === plan.tier}
              className="self-start bg-primary text-on-primary font-label-md text-label-md py-2 px-5 rounded-full disabled:opacity-60"
            >
              {sub?.tier === plan.tier
                ? "Current plan"
                : upgrading === plan.tier
                  ? "Redirecting…"
                  : `Upgrade to ${plan.label}`}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
