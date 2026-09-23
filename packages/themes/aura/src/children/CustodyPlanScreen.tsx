import { useState, type FormEvent } from "react";
import type { ChildFamilyMember, CustodyPattern, CustodyPlanStatusResponse } from "@kidcom/shared";
import { dateKey, paths, useChildFamily, useCustodyPlan, useNavigate, useParams, useSetCustodyPlan, useT } from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { DateField, EditorTitle, Field, FormCard, FormError, PrimaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// The custody plan (no Stitch export; DESIGN.md form parts): a rhythm
// between two parents from a start date, with the handover time and place
// the Today and calendar custody cards show.

const isHHMM = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

type Preset = "alternating" | "twoTwoThree" | "fiveTwoTwoFive" | "nineFive" | "fourteenTwo" | "otherWeekend" | "current";
// Days per block, alternating between the first and second parent.
const PRESETS: Record<Exclude<Preset, "current">, number[]> = {
  alternating: [7, 7],
  twoTwoThree: [2, 2, 3, 2, 2, 3],
  fiveTwoTwoFive: [5, 2, 2, 5],
  nineFive: [9, 5],
  fourteenTwo: [14, 2],
  otherWeekend: [12, 2],
};

function patternFor(days: number[], first: string, second: string): CustodyPattern {
  return {
    cycleLengthDays: days.reduce((a, b) => a + b, 0),
    blocks: days.map((d, i) => ({ userId: i % 2 === 0 ? first : second, days: d })),
  };
}

export function CustodyPlanScreen() {
  const { t } = useT("children");
  const { childId } = useParams();
  const { data: status, isLoading } = useCustodyPlan(childId);
  const { data: members = [] } = useChildFamily(childId);
  if (!childId || isLoading || !status) return <EditorTitle>{t("custody.title")}</EditorTitle>;
  return <PlanForm key={status.plan?.id ?? "new"} childId={childId} status={status} members={members} />;
}

function PlanForm({ childId, status, members }: { childId: string; status: CustodyPlanStatusResponse; members: ChildFamilyMember[] }) {
  const { t } = useT("children");
  const navigate = useNavigate();
  const save = useSetCustodyPlan(childId);
  const plan = status.plan;
  const parents = members.filter((m) => m.role !== "FAMILY");
  const [preset, setPreset] = useState<Preset>(plan ? "current" : "alternating");
  const [first, setFirst] = useState(plan?.patternDays.blocks[0]?.userId ?? parents[0]?.userId ?? "");
  const [second, setSecond] = useState(plan?.patternDays.blocks.find((b) => b.userId !== plan.patternDays.blocks[0]?.userId)?.userId ?? parents[1]?.userId ?? "");
  const [startDate, setStartDate] = useState(plan?.startDate.slice(0, 10) ?? dateKey());
  const [time, setTime] = useState(plan?.handoverTime ?? "");
  const [location, setLocation] = useState(plan?.handoverLocation ?? "");
  const [error, setError] = useState<string | null>(null);

  if (parents.length < 2) {
    return (
      <div className="flex flex-col w-full pb-6 gap-space-lg">
        <EditorTitle>{t("custody.title")}</EditorTitle>
        <EmptyCard icon="group_add" text={t("custody.needsTwo")} to={`${paths.family.invite()}?child=${encodeURIComponent(childId)}`} action={t("family.invite")} />
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!first || !second || first === second) return setError(t("custody.twoDifferent"));
    if (time && !isHHMM(time)) return setError(t("custody.badTime"));
    const pattern =
      preset === "current" && plan
        ? { ...plan.patternDays, blocks: plan.patternDays.blocks.map((b) => ({ ...b, userId: b.userId === plan.patternDays.blocks[0]!.userId ? first : second })) }
        : patternFor(PRESETS[preset === "current" ? "alternating" : preset], first, second);
    save.mutate(
      {
        label: preset === "current" && plan ? plan.label : t(`custody.presets.${preset}`),
        startDate,
        patternDays: pattern,
        handoverTime: time || null,
        handoverLocation: location.trim() || null,
      },
      { onSuccess: () => navigate(paths.children.profile(childId), { replace: true }), onError: (err) => setError(err instanceof Error ? err.message : t("edit.failed")) },
    );
  };

  const presetOptions: Preset[] = [...(plan ? (["current"] as const) : []), "alternating", "twoTwoThree", "fiveTwoTwoFive", "nineFive", "fourteenTwo", "otherWeekend"];
  const parentSelect = (id: string, value: string, onChange: (v: string) => void, label: string) => (
    <Field id={id} label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {parents.map((p) => (
            <SelectItem key={p.userId} value={p.userId}>
              {p.firstName} {p.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("custody.title")}</EditorTitle>
      {status.locked && (
        <div className="p-space-md rounded-[24px] bg-error-container/60 text-on-error-container flex items-start gap-3">
          <Icon name="lock" className="text-[20px]" />
          <p className="font-body-md text-body-md">{t("custody.locked")}</p>
        </div>
      )}
      {!status.locked && status.daysUntilLocked !== null && (
        <div className="p-space-md rounded-[24px] bg-peach flex items-start gap-3">
          <Icon name="schedule" className="text-[20px] text-on-surface" />
          <p className="font-body-md text-body-md text-on-surface">{t("custody.lockSoon", { count: status.daysUntilLocked })}</p>
        </div>
      )}

      <FormCard>
        <Field label={t("custody.rhythm")}>
          <div role="radiogroup" aria-label={t("custody.rhythm")} className="flex flex-col gap-2">
            {presetOptions.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={preset === p}
                onClick={() => setPreset(p)}
                className={cn(
                  "flex items-center justify-between gap-3 p-3 rounded-2xl text-left transition-colors",
                  preset === p ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface",
                )}
              >
                <span className="flex flex-col">
                  <span className="font-label-md text-label-md font-bold">{t(`custody.presets.${p}`)}</span>
                  <span className={cn("font-label-sm text-label-sm", preset === p ? "text-on-primary/80" : "text-secondary")}>
                    {p === "current" ? plan!.patternDays.blocks.map((b) => b.days).join("/") : t(`custody.presetHints.${p}`)}
                  </span>
                </span>
                {preset === p && <Icon name="check" className="text-[18px]" />}
              </button>
            ))}
          </div>
        </Field>
        {parentSelect("first", first, setFirst, t("custody.first"))}
        {parentSelect("second", second, setSecond, t("custody.second"))}
        <DateField id="start" label={t("custody.start")} value={startDate} onChange={setStartDate} />
      </FormCard>

      <FormCard>
        <div className="grid grid-cols-2 gap-3">
          <Field id="time" label={t("custody.time")} hint={t("custody.timeHint")}>
            <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field id="location" label={t("custody.place")}>
            <Input id="location" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder={t("custody.placePlaceholder")} />
          </Field>
        </div>
      </FormCard>

      <FormError message={error} />
      <PrimaryButton icon="check" disabled={save.isPending || status.locked}>
        {t("custody.save")}
      </PrimaryButton>
    </form>
  );
}
