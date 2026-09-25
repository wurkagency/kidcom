import { useRef, useState, type KeyboardEvent } from "react";
import { ALL_RELATIONSHIP_TYPES, type ChildDetail, type ChildFamilyMember, type RelationshipType } from "@kidcom/shared";
import {
  dateKey,
  Link,
  mediaUrl,
  paths,
  useAddGrowthEntry,
  useChild,
  useChildFamily,
  useCurrentUser,
  useCustodyPlan,
  useEmergencyContacts,
  useFormat,
  useGrowthEntries,
  useHealthSchedule,
  useNavigate,
  useParams,
  useRemoveMember,
  useT,
  useUpdateChild,
  useUpdateMemberRelationship,
  useUploadMedia,
} from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field, FormError, PrimaryButton, SecondaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { childAge } from "./age";
import { clothingAgeRange, custodyRhythm, parentNames } from "./format";
import { GrowthChart, paceKey, summarizeGrowth } from "./growth";

// kidcom_child_profile_1: cover photo and avatar, name and age, parents,
// the custody plan, measurements (edited in place), the WHO growth curve,
// medical info and contacts, and the family around the child.

export function ChildProfileScreen() {
  const { t } = useT("children");
  const { childId } = useParams();
  const { data: child, isLoading, isError } = useChild(childId);
  if (isLoading) return <Skeleton className="w-full h-80 bg-surface-container" />;
  if (isError || !child) return <EmptyCard icon="child_care" text={t("profile.notFound")} to={paths.children.overview()} action={t("profile.back")} />;
  return <Profile child={child} />;
}

function Profile({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const fmt = useFormat();
  const { data: members = [] } = useChildFamily(child.id);
  const name = `${child.firstName} ${child.lastName}`.trim();

  // Edge to edge like the export: the cover spans the screen; sections add their own margin.
  return (
    <div className="flex flex-col -mx-margin w-[calc(100%+2.5rem)] pb-space-xl gap-space-lg">
      <div className="relative flex flex-col gap-space-md overflow-hidden mb-2">
        <Cover child={child} />
        <div className="px-margin -mt-16 relative flex flex-col gap-space-md">
          <div className="rounded-lg p-space-md shadow-sm flex flex-col gap-space-md bg-surface">
            <div className="flex flex-col items-center text-center gap-space-sm w-full">
              <Avatar child={child} />
              <div className="flex flex-col items-center w-full pt-0.5">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">{name}</h1>
                    {child.canEdit && (
                      <Link to={paths.children.edit(child.id)} aria-label={t("profile.editBasics")} className="inline-flex items-center justify-center p-1 text-on-surface-variant hover:text-on-surface transition-colors active:scale-95">
                        <Icon name="edit" className="text-[15px] text-secondary" />
                      </Link>
                    )}
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">
                    {t("profile.basics", {
                      gender: t(`gender.${child.gender}`),
                      date: fmt.date(child.birthday, { day: "2-digit", month: "2-digit", year: "numeric" }),
                      age: childAge(child.birthday),
                    })}
                  </span>
                </div>
                {members.some((m) => m.role !== "FAMILY") && (
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-on-secondary-container">
                    <Icon name="supervisor_account" className="text-[15px]" />
                    <p className="font-label-sm text-label-sm truncate">{parentNames(members)}</p>
                  </div>
                )}
              </div>
            </div>
            <CustodyCard child={child} />
          </div>
        </div>
      </div>

      <Measurements child={child} />
      <GrowthCard child={child} />
      <CareTiles child={child} />
      <Family child={child} members={members} />
    </div>
  );
}

function Cover({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const upload = useUploadMedia();
  const update = useUpdateChild(child.id);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative w-full h-80 overflow-hidden bg-secondary-container">
      {child.coverImageUrl && <img src={mediaUrl(child.coverImageUrl)} alt="" className="w-full h-full object-cover" />}
      <div className="absolute bottom-0 w-full h-20 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
      {child.canEdit && (
        <>
          <button
            type="button"
            aria-label={t("profile.changeCover")}
            disabled={upload.isPending || update.isPending}
            onClick={() => input.current?.click()}
            className="absolute top-3 right-margin w-9 h-9 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center shadow-sm active:scale-95"
          >
            <Icon name={upload.isPending ? "progress_activity" : "photo_camera"} className={cn("text-[18px]", upload.isPending && "animate-spin")} />
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload.mutate(file, { onSuccess: (asset) => update.mutate({ coverImageMediaAssetId: asset.id }) });
            }}
          />
        </>
      )}
    </div>
  );
}

function Avatar({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const upload = useUploadMedia();
  const update = useUpdateChild(child.id);
  const input = useRef<HTMLInputElement>(null);
  const face = (
    <div className="w-16 h-16 rounded-full ring-4 ring-surface-container-lowest shadow-md overflow-hidden bg-surface-container">
      <PersonAvatar mediaId={child.profileImageUrl} initials={child.firstName.charAt(0)} className="w-full h-full" />
    </div>
  );
  if (!child.canEdit) return <div className="relative shrink-0 -mt-10 mb-1">{face}</div>;
  return (
    <div className="relative shrink-0 -mt-10 mb-1">
      <button type="button" aria-label={t("profile.changePhoto")} onClick={() => input.current?.click()} className="rounded-full">
        {face}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload.mutate(file, { onSuccess: (asset) => update.mutate({ profileImageMediaAssetId: asset.id }) });
        }}
      />
    </div>
  );
}

function CustodyCard({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const fmt = useFormat();
  // Custody planning comes with a Parent or Family Circle (subscription model).
  const included = child.tier !== "FREE";
  const { data } = useCustodyPlan(child.id, included);
  const plan = data?.plan;
  const canEditPlan = child.myRole !== "FAMILY" && included;
  // Every handover falls on the same weekday when the blocks are whole weeks.
  const sameWeekday = plan?.patternDays.blocks.every((b) => b.days % 7 === 0);
  return (
    <div className="flex flex-col gap-1 rounded-2xl px-3.5 py-2.5 text-left bg-obsidian shadow-xs w-full">
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md font-bold text-on-primary">{t("custody.title")}</span>
        {canEditPlan && (
          <Link to={paths.children.custody(child.id)} aria-label={t("custody.edit")} className="text-on-primary-container hover:text-on-primary transition-colors inline-flex items-center justify-center">
            <Icon name="edit" className="text-[16px] text-on-primary" />
          </Link>
        )}
      </div>
      {plan ? (
        <>
          <p className="font-body-md text-body-md text-inverse-on-surface leading-snug">
            {sameWeekday
              ? t("custody.summaryWeekday", { rhythm: custodyRhythm(plan), weekday: fmt.date(`${plan.startDate.slice(0, 10)}T12:00:00Z`, { weekday: "long" }) })
              : t("custody.summary", { rhythm: custodyRhythm(plan) })}
          </p>
          <p className="font-micro-meta text-micro-meta mt-0.5 text-tertiary-fixed-dim">
            {t("custody.since", { date: fmt.date(`${plan.startDate.slice(0, 10)}T12:00:00Z`, { day: "2-digit", month: "long", year: "numeric" }) })}
          </p>
        </>
      ) : (
        <p className="font-body-md text-body-md text-inverse-on-surface leading-snug">
          {included ? t(canEditPlan ? "custody.noneEditor" : "custody.none") : t("custody.needsCircle")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Measurements (accordion rows, edited in place)
// ---------------------------------------------------------------------------

function Measurements({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const { data: entries = [] } = useGrowthEntries(child.id);
  const addEntry = useAddGrowthEntry(child.id);
  const update = useUpdateChild(child.id);
  const [open, setOpen] = useState<string | null>(null);
  const latest = (key: "heightCm" | "weightKg") =>
    [...entries].filter((e) => e[key] !== null).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const h = latest("heightCm");
  const w = latest("weightKg");
  const clothing = clothingAgeRange(child.clothingSize);

  const rows = [
    {
      id: "height",
      label: t("measure.height"),
      value: h?.heightCm ?? child.heightCm,
      unit: "cm",
      numeric: true,
      updatedAt: h?.measuredAt,
      save: (v: string) => addEntry.mutateAsync({ measuredAt: new Date().toISOString(), heightCm: Number(v) }),
    },
    {
      id: "weight",
      label: t("measure.weight"),
      value: w?.weightKg ?? null,
      unit: "kg",
      numeric: true,
      updatedAt: w?.measuredAt,
      save: (v: string) => addEntry.mutateAsync({ measuredAt: new Date().toISOString(), weightKg: Number(v) }),
    },
    {
      id: "clothing",
      label: t("measure.clothing"),
      sub: clothing ? t("measure.years", { from: clothing.from, to: clothing.to, count: clothing.to }) : undefined,
      value: child.clothingSize,
      unit: "",
      numeric: false,
      save: (v: string) => update.mutateAsync({ clothingSize: v }),
    },
    {
      id: "shoe",
      label: t("measure.shoe"),
      value: child.shoeSize,
      unit: "",
      numeric: false,
      save: (v: string) => update.mutateAsync({ shoeSize: v }),
    },
  ];

  return (
    <div className="flex flex-col gap-space-xs px-margin">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-title-md text-title-md text-on-surface">{t("measure.title")}</h2>
      </div>
      <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden border border-outline-variant/30 flex flex-col">
        {rows.map((r, i) => (
          <div key={`${r.id}-${r.value ?? ""}`}>
            {i > 0 && <div className="border-t border-outline-variant/30" />}
            <MeasureRow
              {...r}
              editable={child.canEdit}
              open={open === r.id}
              onToggle={() => setOpen(open === r.id ? null : r.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MeasureRow({
  label,
  sub,
  value,
  unit,
  numeric,
  updatedAt,
  save,
  editable,
  open,
  onToggle,
}: {
  label: string;
  sub?: string;
  value: number | string | null;
  unit: string;
  numeric: boolean;
  updatedAt?: string;
  save: (v: string) => Promise<unknown>;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useT("children");
  const fmt = useFormat();
  // Numbers are edited as the country writes them: "48,5" in DK, "48.5" in the US.
  const [draft, setDraft] = useState(value === null ? "" : numeric ? fmt.number(Number(value), { useGrouping: false, maximumFractionDigits: 2 }) : String(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const shown = value === null || value === "" ? "—" : unit ? `${fmt.number(Number(value))} ${unit}` : String(value);

  const commit = async () => {
    const typed = draft.trim();
    if (!typed) return;
    const n = numeric ? fmt.parseNumber(typed) : Number.NaN;
    if (numeric && !(n > 0)) return setState("error");
    const v = numeric ? String(n) : typed;
    if (v === String(value ?? "")) return;
    setState("saving");
    try {
      await save(v);
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const whenLabel = (iso: string) =>
    dateKey(iso) === dateKey() ? t("measure.todayAt", { time: fmt.time(iso) }) : `${fmt.weekdayDate(iso)}, ${fmt.time(iso)}`;

  return (
    <div className={cn("flex flex-col", open && "bg-surface-container-low/60")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={editable ? onToggle : undefined}
        className={cn("w-full flex items-center justify-between p-3.5 text-left", editable && !open && "hover:bg-surface-container/50 transition-colors")}
      >
        <div className="flex flex-col">
          <span className={cn("font-label-md text-label-md text-on-surface", open && "font-bold")}>{label}</span>
          {sub && <span className="font-micro-meta text-micro-meta text-secondary">{sub}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-title-md text-title-md text-on-surface">{shown}</span>
          {editable && <Icon name="expand_more" className={cn("text-secondary text-[20px] transition-transform", open && "rotate-180")} />}
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-0.5 flex flex-col gap-2.5">
          <div className="w-full flex items-center justify-between bg-surface-container-lowest border border-outline-variant rounded-full px-4 py-2.5 shadow-xs ring-1 ring-primary/20">
            <input
              autoFocus
              type={numeric ? "number" : "text"}
              inputMode={numeric ? "decimal" : "text"}
              step={numeric ? "0.1" : undefined}
              aria-label={label}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setState("idle");
              }}
              onBlur={() => void commit()}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && void commit()}
              className="flex-1 min-w-0 bg-transparent font-headline-sm text-headline-sm text-on-surface outline-none tracking-tight"
            />
            {unit && <span className="font-label-md text-label-md text-secondary shrink-0 ml-1">{unit}</span>}
          </div>
          <div className="flex items-center justify-between text-secondary px-0.5">
            <span className="font-micro-meta text-micro-meta">{updatedAt ? t("measure.lastUpdated", { when: whenLabel(updatedAt) }) : ""}</span>
            {state === "saved" && (
              <span className="inline-flex items-center gap-1 font-micro-meta text-micro-meta font-bold text-secondary">
                <Icon name="check" className="text-[14px]" />
                {t("measure.saved")}
              </span>
            )}
            {state === "saving" && <span className="font-micro-meta text-micro-meta">{t("measure.saving")}</span>}
            {state === "error" && <span className="font-micro-meta text-micro-meta text-error">{t("measure.error")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Growth trajectory
// ---------------------------------------------------------------------------

function GrowthCard({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const fmt = useFormat();
  const { data: entries = [] } = useGrowthEntries(child.id);
  const summary = summarizeGrowth(entries, child.birthday, child.gender);
  const pace = paceKey(summary.percentileShift);

  return (
    <div className="rounded-lg p-space-md flex flex-col gap-space-sm shadow-xs relative overflow-hidden mx-margin bg-mint border border-secondary-fixed-dim/60">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="font-title-md text-title-md text-on-surface">{t("growth.title")}</h2>
            <Icon name="insights" className="text-[16px] text-secondary" />
          </div>
          <p className="font-body-md text-body-md text-secondary mt-0.5">{t("growth.subtitle")}</p>
        </div>
        {summary.percentile !== null && (
          <div className="bg-surface-container-lowest rounded-full px-3 py-1 shadow-xs shrink-0">
            <span className="font-label-sm text-label-sm text-on-surface">
              {t("growth.percentile", { count: Math.max(1, Math.min(99, Math.round(summary.percentile))), ordinal: true })}
            </span>
          </div>
        )}
      </div>
      <GrowthChart summary={summary} gender={child.gender} />
      {summary.sixMonthGainCm !== null && (
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5">
            <Icon name="trending_up" className="text-[16px] text-secondary" />
            <span className="font-label-md text-label-md text-on-surface">
              {t("growth.gain", { cm: fmt.number(summary.sixMonthGainCm, { maximumFractionDigits: 1, signDisplay: "always" }) })}
            </span>
          </div>
          {pace && <span className="font-micro-meta text-micro-meta text-secondary">{t(pace)}</span>}
        </div>
      )}
      {child.canEdit && (
        <Link
          to={`${paths.children.growth(child.id)}?add=1`}
          className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-full font-label-md text-label-md text-on-surface shadow-sm hover:opacity-95 active:scale-[0.98] transition-all mt-1 bg-secondary-fixed"
        >
          <Icon name="add" className="text-[20px]" />
          <span>{t("growth.add")}</span>
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Care & Essentials
// ---------------------------------------------------------------------------

function CareTiles({ child }: { child: ChildDetail }) {
  const { t } = useT("children");
  const { data: schedule } = useHealthSchedule(child.id);
  const { data: contacts = [] } = useEmergencyContacts(child.id);
  const ageMonths = (new Date().getTime() - new Date(child.birthday).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  const overdue = schedule?.items.filter((i) => !i.completed && i.ageInMonths < ageMonths - 1).length ?? 0;
  const saved = contacts.filter((c) => !c.derived).length;
  const tile = "flex-1 bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/30 shadow-xs flex flex-col justify-between hover:bg-surface-container/50 transition-colors";

  return (
    <div className="flex flex-col gap-space-xs mx-margin mt-1">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-title-md text-title-md text-on-surface">{t("care.title")}</h2>
      </div>
      <div className="flex gap-3">
        <Link to={paths.children.medical(child.id)} className={tile}>
          <div className="flex justify-between items-center">
            <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-fixed">
              <Icon name="medical_services" className="text-[20px]" />
            </div>
            <Icon name="chevron_right" className="text-secondary text-[18px]" />
          </div>
          <div className="mt-3">
            <h3 className="font-label-md text-label-md text-on-surface font-bold">{t("care.medical")}</h3>
            <p className="font-micro-meta text-micro-meta text-secondary mt-0.5 leading-snug">{t("care.medicalHint")}</p>
            <div className="mt-2">
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full font-micro-meta text-micro-meta", overdue ? "bg-error-container text-on-error-container" : "bg-surface-container text-secondary")}>
                {overdue ? t("care.overdue", { count: overdue }) : t("care.upToDate")}
              </span>
            </div>
          </div>
        </Link>
        <Link to={paths.children.contacts(child.id)} className={tile}>
          <div className="flex justify-between items-center">
            <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-fixed">
              <Icon name="call" className="text-[20px]" />
            </div>
            <Icon name="chevron_right" className="text-secondary text-[18px]" />
          </div>
          <div className="mt-3">
            <h3 className="font-label-md text-label-md text-on-surface font-bold">{t("care.contacts")}</h3>
            <p className="font-micro-meta text-micro-meta text-secondary mt-0.5 leading-snug">{t("care.contactsHint")}</p>
            <div className="mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container font-micro-meta text-micro-meta text-secondary">
                {t("care.saved", { count: saved })}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

function Family({ child, members }: { child: ChildDetail; members: ChildFamilyMember[] }) {
  const { t } = useT("children");
  const me = useCurrentUser();
  const [editing, setEditing] = useState<ChildFamilyMember | null>(null);
  const manages = child.myRole === "PARENT";
  const firstName = (id: string | null) => members.find((m) => m.userId === id)?.firstName;

  return (
    <div className="flex flex-col gap-space-xs mx-margin">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-title-md text-title-md text-on-surface">{t("family.title")}</h2>
      </div>
      <div className="bg-surface-container-lowest rounded-2xl p-2 border border-outline-variant/30 shadow-xs flex flex-col">
        {members.map((m, i) => {
          const full = `${m.firstName} ${m.lastName}`.trim();
          const via = m.role === "FAMILY" ? firstName(m.invitedByUserId) : undefined;
          return (
            <div key={m.userId}>
              {i > 0 && <div className="border-t border-outline-variant/20 mx-2" />}
              <div className="flex items-center justify-between p-2.5 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <PersonAvatar mediaId={m.avatarUrl} initials={`${m.firstName.charAt(0)}${m.lastName.charAt(0)}`} className="w-10 h-10 shrink-0 ring-1 ring-outline-variant/30" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-md text-label-md text-on-surface font-bold truncate">
                      {full}
                      {m.userId === me.id && <span className="font-normal text-secondary"> {t("family.you")}</span>}
                    </span>
                    <span className="font-micro-meta text-micro-meta text-secondary truncate">
                      {t(`relationship.${m.relationship}`)}
                      {via && <span className="text-on-secondary-container"> {t("family.via", { name: via })}</span>}
                    </span>
                  </div>
                </div>
                {manages && m.userId !== me.id && (
                  <button
                    type="button"
                    aria-label={t("family.edit", { name: full })}
                    onClick={() => setEditing(m)}
                    className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors rounded-full hover:bg-surface-container"
                  >
                    <Icon name="edit" className="text-[16px] text-secondary" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {child.myRole !== "FAMILY" && (
          <Link
            to={`${paths.family.invite()}?child=${encodeURIComponent(child.id)}`}
            className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-full font-label-md text-label-md text-on-surface shadow-sm hover:opacity-95 active:scale-[0.98] transition-all mt-2 bg-sage"
          >
            <Icon name="person_add" className="text-[20px]" />
            <span>{t("family.invite")}</span>
          </Link>
        )}
      </div>
      {editing && <MemberSheet childId={child.id} member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberSheet({ childId, member, onClose }: { childId: string; member: ChildFamilyMember; onClose: () => void }) {
  const { t } = useT("children");
  const navigate = useNavigate();
  const update = useUpdateMemberRelationship(childId);
  const remove = useRemoveMember(childId);
  const [relationship, setRelationship] = useState<RelationshipType>(member.relationship);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = `${member.firstName} ${member.lastName}`.trim();

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg">
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{full}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-secondary">{t("family.sheetHint")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5">
          <Field id="relationship" label={t("family.relationship")}>
            <Select value={relationship} onValueChange={(v) => setRelationship(v as RelationshipType)}>
              <SelectTrigger id="relationship" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_RELATIONSHIP_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`relationship.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FormError message={error} />
          <PrimaryButton
            type="button"
            icon="check"
            disabled={update.isPending || relationship === member.relationship}
            onClick={() =>
              update.mutate(
                { userId: member.userId, relationship },
                { onSuccess: onClose, onError: (err) => setError(err instanceof Error ? err.message : t("family.failed")) },
              )
            }
          >
            {t("family.save")}
          </PrimaryButton>
          <SecondaryButton icon="person_remove" className="text-error" onClick={() => setConfirming(true)}>
            {t("family.remove")}
          </SecondaryButton>
        </div>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("family.confirmRemove", { name: member.firstName })}
          body={t("family.confirmRemoveBody")}
          confirmLabel={t("family.remove")}
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(member.userId, {
              onSuccess: () => {
                setConfirming(false);
                onClose();
                navigate(paths.children.profile(childId), { replace: true });
              },
              onError: (err) => {
                setConfirming(false);
                setError(err instanceof Error ? err.message : t("family.failed"));
              },
            })
          }
        />
      </SheetContent>
    </Sheet>
  );
}
