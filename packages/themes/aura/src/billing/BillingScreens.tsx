import { useEffect, useRef, useState } from "react";
import type { BillingPeriod, SubscriptionTier } from "@kidcom/shared";
import {
  LEGAL_URLS,
  Link,
  paths,
  useBillingPlans,
  useBillingStatus,
  useCancelSubscription,
  useConfirmCheckout,
  useFormat,
  useNavigate,
  useSearchParams,
  useSubscribe,
  useT,
} from "@kidcom/core";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorTitle, FormCard, FormError, PrimaryButton, SecondaryButton, primaryButtonClass } from "../components/Form";
import { Icon } from "../components/Icon";
import { MenuGroup, MenuItem } from "../components/MenuList";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { PeriodToggle, PlanPicker, usePrice } from "./PlanPicker";

// Account & Billing (no Stitch export; DESIGN.md cards). The plan, its
// status and renewal; changing it goes through checkout, which asks for the
// express consent to start at once (waiving the 14-day right of withdrawal)
// before the secure QuickPay payment page.

export function BillingScreen() {
  const { t } = useT("billing");
  const fmt = useFormat();
  const price = usePrice();
  const [params, setParams] = useSearchParams();
  const { data: sub, isLoading } = useBillingStatus();
  const { data: plans } = useBillingPlans();
  const confirm = useConfirmCheckout();
  const cancel = useCancelSubscription();
  const [cancelOpen, setCancelOpen] = useState(false);
  const outcome = params.get("checkout");

  // Back from QuickPay: switch the plan on without waiting for the callback.
  const confirmed = useRef(false);
  const { mutate: confirmCheckout } = confirm;
  useEffect(() => {
    if (outcome === "success" && !confirmed.current) {
      confirmed.current = true;
      confirmCheckout();
    }
  }, [outcome, confirmCheckout]);

  if (isLoading || !sub) return <Skeleton className="h-64 rounded-2xl bg-surface-container-lowest" />;
  const paid = sub.tier !== "FREE";
  const amount = paid && sub.billingPeriod ? plans?.plans.find((p) => p.tier === sub.tier)?.prices[sub.billingPeriod] : undefined;

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("title")}</EditorTitle>

      {outcome === "success" && (confirm.isPending || sub.status === "PENDING") && <Banner icon="hourglass_top" text={t("confirming")} />}
      {outcome === "success" && sub.status === "ACTIVE" && paid && <Banner icon="celebration" text={t("welcome", { plan: t(`tiers.${sub.tier}`) })} tone="mint" />}
      {outcome === "cancel" && <Banner icon="info" text={t("canceledCheckout")} />}
      {sub.status === "PAST_DUE" && <Banner icon="credit_card_off" text={t("pastDue")} tone="error" />}

      <FormCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">{t("yourPlan")}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">{t(`tiers.${sub.tier}`)}</span>
            <span className="font-body-md text-body-md text-secondary">{t(`taglines.${sub.tier}`)}</span>
          </div>
          <span className={cn("px-2.5 py-1 rounded-full font-micro-meta text-micro-meta uppercase shrink-0", sub.status === "ACTIVE" ? "bg-mint text-on-surface" : "bg-surface-container-high text-on-surface-variant")}>
            {t(`status.${sub.status}`)}
          </span>
        </div>
        {paid && (
          <MenuGroup>
            {amount !== undefined && sub.billingPeriod && <MenuItem label={t("price")} value={`${price(amount)} ${t(`per.${sub.billingPeriod}`)}`} />}
            {sub.currentPeriodEnd && (
              <MenuItem label={t(sub.status === "CANCELED" ? "endsOn" : "renewsOn")} value={fmt.date(sub.currentPeriodEnd, { day: "2-digit", month: "2-digit", year: "numeric" })} />
            )}
          </MenuGroup>
        )}
        {sub.trialEndsAt && sub.status === "TRIALING" && <p className="font-body-md text-body-md text-secondary">{t("trialEnds", { date: fmt.date(sub.trialEndsAt) })}</p>}
        <Link to={paths.billing.checkout()} className={primaryButtonClass}>
          <Icon name="workspace_premium" className="text-[18px]" />
          {paid ? t("change") : t("upgrade")}
        </Link>
        {paid && sub.status !== "CANCELED" && (
          <SecondaryButton icon="cancel" onClick={() => setCancelOpen(true)}>
            {t("cancel")}
          </SecondaryButton>
        )}
      </FormCard>

      <p className="flex items-center gap-2 px-1 font-label-sm text-label-sm text-secondary">
        <Icon name="lock" className="text-[14px]" />
        {t("secure")}
      </p>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("cancelTitle")}
        body={t("cancelBody")}
        confirmLabel={t("cancelConfirm")}
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => (setCancelOpen(false), setParams({}, { replace: true })) })}
      />
    </div>
  );
}

function Banner({ icon, text, tone }: { icon: string; text: string; tone?: "mint" | "error" }) {
  return (
    <div
      className={cn(
        "p-space-md rounded-[24px] flex items-start gap-3",
        tone === "mint" ? "bg-mint text-on-surface" : tone === "error" ? "bg-error-container/60 text-on-error-container" : "bg-peach text-on-surface",
      )}
    >
      <Icon name={icon} className="text-[20px]" />
      <p className="font-body-md text-body-md">{text}</p>
    </div>
  );
}

/** Choose a plan, give the consent, go to payment. Also used by onboarding's plan step. */
export function CheckoutForm({ onFree }: { onFree?: () => void }) {
  const { t } = useT("billing");
  const [params] = useSearchParams();
  const { data: sub } = useBillingStatus();
  const subscribe = useSubscribe();
  const [tier, setTier] = useState<SubscriptionTier>((params.get("tier") as SubscriptionTier) || "PARENTS");
  const [period, setPeriod] = useState<BillingPeriod>((params.get("period") as BillingPeriod) || "ANNUAL");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = tier !== "FREE";

  const go = () => {
    setError(null);
    if (paid && !consent) return setError(t("consentRequired"));
    subscribe.mutate(
      { tier, ...(paid ? { billingPeriod: period, acceptWithdrawalWaiver: true } : {}) },
      {
        onSuccess: ({ redirectUrl }) => {
          if (!redirectUrl) onFree?.();
        },
        onError: (err) => setError(err instanceof Error ? err.message : t("failed")),
      },
    );
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <PeriodToggle value={period} onChange={setPeriod} />
      <PlanPicker tier={tier} period={period} current={sub?.tier ?? null} onTier={setTier} />
      {paid && (
        <label className="flex items-start gap-3 p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 cursor-pointer">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-label={t("consentLabel")} className="mt-0.5" />
          <span className="font-body-md text-body-md text-on-surface">
            {t("consent")}{" "}
            <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              {t("terms")}
            </a>
          </span>
        </label>
      )}
      <FormError message={error} />
      <PrimaryButton type="button" icon={paid ? "lock" : "check"} disabled={subscribe.isPending || (sub?.tier === tier && tier === "FREE")} onClick={go}>
        {paid ? t("toPayment") : t("chooseFree")}
      </PrimaryButton>
      {paid && <p className="px-1 font-label-sm text-label-sm text-secondary">{t("quickpay")}</p>}
    </div>
  );
}

export function CheckoutScreen() {
  const { t } = useT("billing");
  const navigate = useNavigate();
  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("checkoutTitle")}</EditorTitle>
      <CheckoutForm onFree={() => navigate(`${paths.billing.overview()}?checkout=success`, { replace: true })} />
    </div>
  );
}
