import type { BillingPeriod, SubscriptionTier } from "@kidcom/shared";
import { useBillingPlans, useFormat, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

// The three plans side by side (DESIGN.md cards; prices from the server,
// shown the country's way): Free, Parents, Family, monthly or yearly.

export const TIERS: SubscriptionTier[] = ["FREE", "PARENTS", "FAMILY"];
const FEATURES: Record<SubscriptionTier, string[]> = {
  FREE: ["oneChild", "you"],
  PARENTS: ["unlimitedChildren", "coParent", "everything"],
  FAMILY: ["unlimitedChildren", "extended", "everything"],
};

const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";

/** "29,00 kr." in DK, "DKK 29.00" in the US. */
export function usePrice() {
  const fmt = useFormat();
  return (ore: number) => fmt.number(ore / 100, { style: "currency", currency: "DKK" });
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
  onTier,
}: {
  tier: SubscriptionTier;
  period: BillingPeriod;
  current?: SubscriptionTier | null;
  onTier: (t: SubscriptionTier) => void;
}) {
  const { t } = useT("billing");
  const fmt = useFormat();
  const price = usePrice();
  const { data } = useBillingPlans();

  if (!data) return <Skeleton className="h-72 rounded-2xl bg-surface-container-lowest" />;
  return (
    <div role="radiogroup" aria-label={t("plans")} className="flex flex-col gap-3">
      {TIERS.map((id) => {
        const plan = data.plans.find((p) => p.tier === id);
        const selected = tier === id;
        const monthly = plan?.prices.MONTHLY ?? 0;
        const annual = plan?.prices.ANNUAL ?? 0;
        const saving = plan ? 1 - annual / (monthly * 12) : 0;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onTier(id)}
            className={cn(
              "w-full text-left rounded-2xl p-4 border transition-all",
              selected ? "bg-primary text-on-primary border-primary shadow-sm" : "bg-surface-container-lowest border-outline-variant/30 shadow-xs",
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
                <span className="font-title-md text-title-md">{plan ? price(period === "MONTHLY" ? monthly : annual) : t("free")}</span>
                {plan && <span className={cn("font-micro-meta text-micro-meta", selected ? "text-on-primary/80" : "text-secondary")}>{t(`per.${period}`)}</span>}
                {plan && period === "ANNUAL" && saving > 0.005 && (
                  <span className={cn("mt-1 px-2 py-0.5 rounded-full font-micro-meta text-micro-meta", selected ? "bg-on-primary/15" : "bg-mint text-on-surface")}>
                    {t("save", { percent: fmt.percent(saving) })}
                  </span>
                )}
              </div>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {FEATURES[id].map((f) => (
                <li key={f} className="flex items-center gap-2 font-body-md text-body-md">
                  <Icon name="check" className={cn("text-[16px]", selected ? "text-on-primary" : "text-secondary")} />
                  {t(`features.${f}`)}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
      <p className="px-1 font-label-sm text-label-sm text-secondary">{t("vat", { rate: fmt.percent(data.vatRate) })}</p>
    </div>
  );
}
