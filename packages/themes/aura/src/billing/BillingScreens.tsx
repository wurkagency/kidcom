import { useEffect, useRef, useState } from "react";
import type { BillingPeriod, SubscriptionDto, SubscriptionTier } from "@kidcom/shared";
import { STORAGE_WARN_RATIO } from "@kidcom/shared";
import {
  LEGAL_URLS,
  Link,
  paths,
  suspendedChildArchiveUrl,
  useBillingPlans,
  useBillingStatus,
  useCancelCircleInvite,
  useCancelSubscription,
  useChangeTier,
  useConfirmCheckout,
  useFormat,
  useInviteToCircle,
  useLeaveCircle,
  useMoveChild,
  useNavigate,
  useRedeemCoupon,
  useRemoveCircleMember,
  useSearchParams,
  useStartTrial,
  useSubscribe,
  useSuspendedChildren,
  useT,
} from "@kidcom/core";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorTitle, Field, FormCard, FormError, PrimaryButton, SecondaryButton, primaryButtonClass } from "../components/Form";
import { billingErrorText } from "./errors";
import { Icon } from "../components/Icon";
import { MenuGroup, MenuItem } from "../components/MenuList";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { PeriodToggle, PlanPicker, useBytes, usePrice } from "./PlanPicker";

// Account & Billing (no Stitch export; DESIGN.md cards), for the
// subscription model: Single (free) or a Parent/Family Circle, the trial
// without a card, adding a card, storage, a code for a lifetime plan, the
// Family Circle's parent members, and children nobody pays for any more.

const dateOpts = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

export function BillingScreen() {
  const { t } = useT("billing");
  const fmt = useFormat();
  const price = usePrice();
  const [params, setParams] = useSearchParams();
  const { data: sub, isLoading } = useBillingStatus();
  const { data: plans } = useBillingPlans();
  const confirm = useConfirmCheckout();
  const cancel = useCancelSubscription();
  const leave = useLeaveCircle();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const outcome = params.get("checkout");

  // Back from QuickPay: record the card (trial) or switch the plan on, without waiting for the callback.
  const confirmed = useRef(false);
  const { mutate: confirmCheckout } = confirm;
  useEffect(() => {
    if (outcome === "success" && !confirmed.current) {
      confirmed.current = true;
      confirmCheckout();
    }
  }, [outcome, confirmCheckout]);

  if (isLoading || !sub) return <Skeleton className="h-64 rounded-2xl bg-surface-container-lowest" />;
  const owner = sub.circle?.role === "OWNER";
  const member = sub.circle?.role === "MEMBER";
  const amount = owner && sub.billingPeriod ? plans?.plans.find((p) => p.tier === sub.tier)?.prices?.[sub.billingPeriod] : undefined;
  const trialing = sub.status === "TRIALING" && !!sub.trialEndsAt;

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <EditorTitle>{t("title")}</EditorTitle>

      {outcome === "success" && !confirm.isError && (confirm.isPending || sub.status === "PENDING") && <Banner icon="hourglass_top" text={t("confirming")} />}
      {outcome === "success" && sub.status === "ACTIVE" && owner && <Banner icon="celebration" text={t("welcome", { plan: t(`tiers.${sub.tier}`) })} tone="mint" />}
      {outcome === "success" && trialing && sub.cardOnFile && <Banner icon="credit_score" text={t("cardAdded", { date: fmt.date(sub.trialEndsAt!, dateOpts) })} tone="mint" />}
      {outcome === "cancel" && <Banner icon="info" text={t("canceledCheckout")} />}
      {outcome === "success" && confirm.isError && <Banner icon="credit_card_off" text={`${billingErrorText(confirm.error, t)} ${t("declinedBanner")}`} tone="error" />}
      {trialing && !sub.cardOnFile && <Banner icon="event" text={t("trialNoCard", { date: fmt.date(sub.trialEndsAt!, dateOpts) })} />}

      <FormCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">{t("yourPlan")}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">{t(`tiers.${sub.tier}`)}</span>
            <span className="font-body-md text-body-md text-secondary">
              {member ? t("memberOf", { owner: sub.circle!.ownerName }) : t(`taglines.${sub.tier}`)}
            </span>
          </div>
          <span
            className={cn(
              "px-2.5 py-1 rounded-full font-micro-meta text-micro-meta uppercase shrink-0",
              sub.status === "ACTIVE" ? "bg-mint text-on-surface" : "bg-surface-container-high text-on-surface-variant",
            )}
          >
            {sub.lifetime ? t("lifetime") : t(`status.${sub.status}`)}
          </span>
        </div>
        {owner && (
          <MenuGroup>
            {amount !== undefined && sub.billingPeriod && <MenuItem label={t("price")} value={`${price(amount)} ${t(`per.${sub.billingPeriod}`)}`} />}
            {trialing && <MenuItem label={t("trialEndsOn")} value={fmt.date(sub.trialEndsAt!, dateOpts)} />}
            {sub.currentPeriodEnd && !sub.lifetime && (
              <MenuItem label={t(sub.status === "CANCELED" ? "endsOn" : "renewsOn")} value={fmt.date(sub.currentPeriodEnd, dateOpts)} />
            )}
            {sub.circle && <MenuItem label={t("childrenInCircle")} value={String(sub.circle.childCount)} />}
          </MenuGroup>
        )}
        <StorageBar sub={sub} />
        {trialing && !sub.cardOnFile && (
          <Link to={`${paths.billing.checkout()}?tier=${sub.tier}`} className={primaryButtonClass}>
            <Icon name="credit_card" className="text-[18px]" />
            {t("addCard")}
          </Link>
        )}
        {!member && !sub.lifetime && (
          <Link to={paths.billing.checkout()} className={trialing && !sub.cardOnFile ? "self-center font-label-md text-label-md underline underline-offset-4" : primaryButtonClass}>
            {!(trialing && !sub.cardOnFile) && <Icon name="workspace_premium" className="text-[18px]" />}
            {owner ? t("change") : sub.trialAvailable ? t("tryFree") : t("upgrade")}
          </Link>
        )}
        {owner && !sub.lifetime && sub.status !== "CANCELED" && (
          <SecondaryButton icon="cancel" onClick={() => (setCancelError(null), setCancelOpen(true))}>
            {t("cancel")}
          </SecondaryButton>
        )}
        {member && (
          <SecondaryButton icon="logout" onClick={() => setLeaveOpen(true)}>
            {t("leaveCircle")}
          </SecondaryButton>
        )}
        <FormError message={cancelError} />
      </FormCard>

      <SuspendedChildrenCard sub={sub} />
      {owner && sub.tier === "FAMILY" && <CircleMembersCard sub={sub} />}
      {!sub.lifetime && <CouponCard />}

      <p className="flex items-center gap-2 px-1 font-label-sm text-label-sm text-secondary">
        <Icon name="lock" className="text-[14px]" />
        {t("secure")}
      </p>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("cancelTitle")}
        body={t(trialing ? "cancelBodyTrial" : "cancelBody")}
        confirmLabel={t("cancelConfirm")}
        pending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(undefined, {
            onSuccess: () => (setCancelOpen(false), setParams({}, { replace: true })),
            onError: (err) => (setCancelOpen(false), setCancelError(billingErrorText(err, t))),
          })
        }
      />
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t("leaveTitle")}
        body={t("leaveBody")}
        confirmLabel={t("leaveCircle")}
        pending={leave.isPending}
        onConfirm={() => leave.mutate(undefined, { onSuccess: () => setLeaveOpen(false) })}
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

/** Storage used by access (§5) against the tier's limit; warns from 80%. */
function StorageBar({ sub }: { sub: SubscriptionDto }) {
  const { t } = useT("billing");
  const bytes = useBytes();
  const { usedBytes, limitBytes } = sub.storage;
  const ratio = limitBytes > 0 ? Math.min(1, usedBytes / limitBytes) : 0;
  const warn = ratio >= STORAGE_WARN_RATIO;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between font-label-sm text-label-sm text-secondary">
        <span>{t("storage")}</span>
        <span>{t("storageUsed", { used: bytes(usedBytes), limit: bytes(limitBytes) })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t("storage")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-2 rounded-full bg-surface-container-high overflow-hidden"
      >
        <div className={cn("h-full rounded-full", warn ? "bg-error" : "bg-primary")} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </div>
      {warn && <p className="font-label-sm text-label-sm text-on-surface-variant">{t("storageWarning")}</p>}
    </div>
  );
}

/** Children nobody pays for any more (D5): hidden until someone pays or takes them over, then deleted. */
function SuspendedChildrenCard({ sub }: { sub: SubscriptionDto }) {
  const { t } = useT("billing");
  const fmt = useFormat();
  const { data: children } = useSuspendedChildren();
  const move = useMoveChild();
  const [error, setError] = useState<string | null>(null);
  if (!children?.length) return null;
  return (
    <FormCard className="border border-error/30">
      <div className="flex items-start gap-3">
        <Icon name="visibility_off" className="text-[20px] text-error" />
        <div className="flex flex-col gap-1">
          <span className="font-title-md text-title-md text-on-surface">{t("suspended.title")}</span>
          <span className="font-body-md text-body-md text-secondary">{t("suspended.body")}</span>
        </div>
      </div>
      {children.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 p-3 rounded-2xl bg-surface-container-low">
          <span className="font-title-sm text-title-sm text-on-surface">{`${c.firstName} ${c.lastName}`.trim()}</span>
          <span className="font-label-sm text-label-sm text-secondary">{t("suspended.deleteOn", { date: fmt.date(c.deleteAfter, dateOpts) })}</span>
          <div className="flex flex-wrap gap-2">
            {c.canTakeOver && sub.circle ? (
              <SecondaryButton
                icon="move_up"
                disabled={move.isPending}
                onClick={() => move.mutate({ childId: c.id, circleId: sub.circle!.id }, { onError: (err) => setError(billingErrorText(err, t)) })}
              >
                {t("suspended.takeOver")}
              </SecondaryButton>
            ) : (
              <Link to={paths.billing.checkout()} className="font-label-md text-label-md underline underline-offset-4 self-center">
                {t("suspended.pay")}
              </Link>
            )}
            <a href={suspendedChildArchiveUrl(c.id)} download className="font-label-md text-label-md underline underline-offset-4 self-center">
              {t("suspended.download")}
            </a>
          </div>
        </div>
      ))}
      <FormError message={error} />
    </FormCard>
  );
}

/** A Family Circle's owner invites other parents in (rule 3); they bring their own children. */
function CircleMembersCard({ sub }: { sub: SubscriptionDto }) {
  const { t } = useT("billing");
  const invite = useInviteToCircle();
  const cancelInvite = useCancelCircleInvite();
  const remove = useRemoveCircleMember();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const circle = sub.circle!;
  return (
    <FormCard>
      <div className="flex flex-col gap-1">
        <span className="font-title-md text-title-md text-on-surface">{t("members.title")}</span>
        <span className="font-body-md text-body-md text-secondary">{t("members.body")}</span>
      </div>
      {circle.members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between gap-3">
          <span className="font-body-md text-body-md text-on-surface">{m.name}</span>
          <button type="button" className="font-label-md text-label-md text-error" onClick={() => remove.mutate(m.userId)} disabled={remove.isPending}>
            {t("members.remove")}
          </button>
        </div>
      ))}
      {circle.pendingInvites.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3">
          <span className="font-body-md text-body-md text-secondary">{t("members.pending", { email: i.email })}</span>
          <button type="button" className="font-label-md text-label-md text-secondary" onClick={() => cancelInvite.mutate(i.id)}>
            {t("members.cancelInvite")}
          </button>
        </div>
      ))}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSent(false);
          invite.mutate(
            { email: email.trim() },
            { onSuccess: () => (setEmail(""), setSent(true)), onError: (err) => setError(billingErrorText(err, t)) },
          );
        }}
      >
        <Field id="circle-invite" label={t("members.email")}>
          <Input id="circle-invite" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <FormError message={error} />
        {sent && <p className="font-label-sm text-label-sm text-secondary">{t("members.sent")}</p>}
        <PrimaryButton type="submit" icon="person_add" disabled={invite.isPending || !email.trim()}>
          {t("members.invite")}
        </PrimaryButton>
      </form>
    </FormCard>
  );
}

/** A code for a lifetime plan (internal testing, family). */
function CouponCard() {
  const { t } = useT("billing");
  const redeem = useRedeemCoupon();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <FormCard>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          redeem.mutate({ code }, { onSuccess: () => setCode(""), onError: (err) => setError(billingErrorText(err, t)) });
        }}
      >
        <Field id="coupon" label={t("coupon.label")}>
          <Input id="coupon" autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <FormError message={error} />
        <SecondaryButton type="submit" icon="redeem" disabled={redeem.isPending || !code.trim()}>
          {t("coupon.redeem")}
        </SecondaryButton>
      </form>
    </FormCard>
  );
}

/**
 * Choose a plan. With the trial still available a paid plan starts a free
 * 30-day trial (no card); in a trial it adds a card; an owner of an active
 * Circle switches tier (downgrades only when what's in use fits); otherwise
 * it asks for the consent and goes to QuickPay. Also used by onboarding.
 */
export function CheckoutForm({ onFree }: { onFree?: () => void }) {
  const { t } = useT("billing");
  const fmt = useFormat();
  const [params] = useSearchParams();
  const { data: sub } = useBillingStatus();
  const { data: plans } = useBillingPlans();
  const subscribe = useSubscribe();
  const trial = useStartTrial();
  const change = useChangeTier();
  const cancel = useCancelSubscription();
  const [tier, setTier] = useState<SubscriptionTier>((params.get("tier") as SubscriptionTier) || "PARENTS");
  const [period, setPeriod] = useState<BillingPeriod>((params.get("period") as BillingPeriod) || "ANNUAL");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = tier !== "FREE";
  const onError = (err: unknown) => setError(billingErrorText(err, t));

  const owner = sub?.circle?.role === "OWNER";
  const trialing = sub?.status === "TRIALING";
  const switching = owner && !trialing && sub?.status !== "CANCELED" && !sub?.lifetime;
  const startsTrial = paid && !!sub?.trialAvailable;
  const needsPayment = paid && !switching && !startsTrial;
  const trialDays = plans?.trialDays ?? 30;

  const go = () => {
    setError(null);
    if (switching) {
      if (tier === "FREE") cancel.mutate(undefined, { onSuccess: () => onFree?.(), onError });
      else change.mutate(tier, { onSuccess: () => onFree?.(), onError });
      return;
    }
    if (startsTrial) {
      trial.mutate({ tier: tier as Exclude<SubscriptionTier, "FREE"> }, { onSuccess: () => onFree?.(), onError });
      return;
    }
    if (paid && !consent) return setError(t("consentRequired"));
    subscribe.mutate(
      { tier, ...(paid ? { billingPeriod: period, acceptWithdrawalWaiver: true } : {}) },
      {
        onSuccess: ({ redirectUrl }) => {
          if (!redirectUrl) onFree?.();
        },
        onError,
      },
    );
  };

  const label = switching
    ? tier === "FREE"
      ? t("switchToSingle")
      : t("switchTo", { plan: t(`tiers.${tier}`) })
    : startsTrial
      ? t("startTrial", { days: trialDays })
      : trialing && paid
        ? t("addCardToPlan")
        : paid
          ? t("toPayment")
          : t("chooseFree");
  const pending = subscribe.isPending || trial.isPending || change.isPending || cancel.isPending;
  const unchanged = (switching && sub?.tier === tier) || (!paid && sub?.tier === "FREE");

  return (
    <div className="flex flex-col gap-space-lg">
      <PeriodToggle value={period} onChange={setPeriod} />
      <PlanPicker tier={tier} period={period} current={sub?.tier ?? null} availability={owner ? sub?.tiers : undefined} onTier={setTier} />
      {startsTrial && <p className="px-1 font-body-md text-body-md text-secondary">{t("trialInfo", { days: trialDays })}</p>}
      {trialing && paid && sub?.trialEndsAt && !switching && (
        <p className="px-1 font-body-md text-body-md text-secondary">{t("cardInTrial", { date: fmt.date(sub.trialEndsAt, dateOpts) })}</p>
      )}
      {needsPayment && (
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
      <PrimaryButton type="button" icon={needsPayment ? "lock" : "check"} disabled={pending || unchanged} onClick={go}>
        {label}
      </PrimaryButton>
      {needsPayment && <p className="px-1 font-label-sm text-label-sm text-secondary">{t("quickpay")}</p>}
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
