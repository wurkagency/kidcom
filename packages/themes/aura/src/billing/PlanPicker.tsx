import type { BillingPeriod, SubscriptionDto, SubscriptionTier, TierLimits } from "@kinnd/shared";
import { useBillingPlans, useFormat, useT } from "@kinnd/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { blockReasonText } from "./errors";

// The three plans side by side (DESIGN.md cards; prices and limits from the
// server's tier catalogue, shown the country's way): Single, Parent Circle,
// Family Circle, monthly or yearly. A tier that can't hold what's in use is
// greyed out with the reason (subscription model §2, D12).

export const TIERS: SubscriptionTier[] = ["FREE", "PARENTS", "FAMILY"];

const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";

/** "39,00 kr." in DK, "DKK 39.00" in the US. */
export function usePrice() {
  const fmt = useFormat();
  return (ore: number) => fmt.number(ore / 100, { style: "currency", currency: "DKK" });
}

/** "500 MB", "1 GB", "100 GB". */
export function useBytes() {
  const fmt = useFormat();
  return (bytes: number) => {
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${fmt.number(gb, { maximumFractionDigits: gb < 10 ? 1 : 0 })} GB` : `${fmt.number(bytes / 1024 ** 2, { maximumFractionDigits: 0 })} MB`;
  };
}

function featureLines(limits: TierLimits, t: (k: string, p?: Record<string, unknown>) => string, bytes: (n: number) => string): string[] {
  const lines = [t("features.children", { count: limits.children }), t("features.storage", { size: bytes(limits.storageBytes) })];
  if (limits.invitableRoles.includes("FAMILY")) lines.push(t("features.family"));
  else if (limits.invitableRoles.includes("PARENT")) lines.push(t("features.coParent"));
  else lines.push(t("features.justYou"));
  if (limits.features.includes("custodyPlanning")) lines.push(t("features.custody"));
  if (limits.features.includes("mediaLibrary")) lines.push(t("features.mediaLibrary"));
  if (limits.features.includes("circleMembers")) lines.push(t("features.circleMembers"));
  lines.push(t("features.everything"));
  return lines;
}

export function PeriodToggle({ value, onChange }: { value: BillingPeriod; onChange: (p: BillingPeriod) => void }) {
  const { t } = useT("billing");
  return (
    <ToggleGroup type="single" spacing={1} value={value} onValueChange={(v) => v && onChange(v as BillingPeriod)} className={segmentedGroup} aria-label={t("period")}>
      {(["MONTHLY", "ANNUAL"] as const).map((p) => (
        <ToggleGroupItem key={p} value={p} variant="segmented" className="flex-1 h-9">
          {t(`periods.${p}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function PlanPicker({
  tier,
  period,
  current,
  availability,
  onTier,
}: {
  tier: SubscriptionTier;
  period: BillingPeriod;
  current?: SubscriptionTier | null;
  /** From GET /billing/status: tiers that can't hold what's in use are greyed out. */
  availability?: SubscriptionDto["tiers"];
  onTier: (t: SubscriptionTier) => void;
}) {
  const { t } = useT("billing");
  const fmt = useFormat();
  const price = usePrice();
  const bytes = useBytes();
  const { data } = useBillingPlans();

  if (!data) return <Skeleton className="h-72 rounded-2xl bg-surface-container-lowest" />;
  return (
    <div role="radiogroup" aria-label={t("plans")} className="flex flex-col gap-3">
      {TIERS.map((id) => {
        const plan = data.plans.find((p) => p.tier === id);
        if (!plan) return null;
        const selected = tier === id;
        const monthly = plan.prices?.MONTHLY ?? 0;
        const annual = plan.prices?.ANNUAL ?? 0;
        const saving = plan.prices ? 1 - annual / (monthly * 12) : 0;
        const fit = availability?.find((a) => a.tier === id);
        const blocked = fit ? !fit.available && current !== id : false;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={blocked}
            disabled={blocked}
            onClick={() => onTier(id)}
            className={cn(
              "w-full text-left rounded-2xl p-4 border transition-all",
              selected ? "bg-primary text-on-primary border-primary shadow-sm" : "bg-surface-container-lowest border-outline-variant/30 shadow-xs",
              blocked && "opacity-60 cursor-not-allowed",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-title-md text-title-md">{t(`tiers.${id}`)}</span>
                  {current === id && (
                    <span className={cn("px-2 py-0.5 rounded-full font-micro-meta text-micro-meta uppercase", selected ? "bg-on-primary/15" : "bg-surface-container-high text-on-surface-variant")}>
                      {t("current")}
                    </span>
                  )}
                </span>
                <span className={cn("font-label-sm text-label-sm", selected ? "text-on-primary/80" : "text-secondary")}>{t(`taglines.${id}`)}</span>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="font-title-md text-title-md">{plan.prices ? price(period === "MONTHLY" ? monthly : annual) : t("free")}</span>
                {plan.prices && <span className={cn("font-micro-meta text-micro-meta", selected ? "text-on-primary/80" : "text-secondary")}>{t(`per.${period}`)}</span>}
                {plan.prices && period === "ANNUAL" && saving > 0.005 && (
                  <span className={cn("mt-1 px-2 py-0.5 rounded-full font-micro-meta text-micro-meta", selected ? "bg-on-primary/15" : "bg-mint text-on-surface")}>
                    {t("save", { percent: fmt.percent(saving) })}
                  </span>
                )}
              </div>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {featureLines(plan.limits, t, bytes).map((f) => (
                <li key={f} className="flex items-center gap-2 font-body-md text-body-md">
                  <Icon name="check" className={cn("text-[16px]", selected ? "text-on-primary" : "text-secondary")} />
                  {f}
                </li>
              ))}
            </ul>
            {blocked && fit && (
              <ul className="mt-3 flex flex-col gap-1">
                {fit.reasons.map((r) => (
                  <li key={JSON.stringify(r)} className="flex items-start gap-2 font-label-sm text-label-sm text-on-surface-variant">
                    <Icon name="block" className="text-[14px] mt-0.5" />
                    {blockReasonText(r, t)}
                  </li>
                ))}
              </ul>
            )}
          </button>
        );
      })}
      <p className="px-1 font-label-sm text-label-sm text-secondary">{t("vat", { rate: fmt.percent(data.vatRate) })}</p>
    </div>
  );
}
