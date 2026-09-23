import { useState } from "react";
import type { ChildDetail, ScheduleItem } from "@kidcom/shared";
import {
  paths,
  useChild,
  useChildFamily,
  useFormat,
  useHealthSchedule,
  useNavigate,
  useParams,
  useT,
  useUpdateScheduleItem,
} from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { DateField, SecondaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { parentNames } from "./format";

// kidcom_child_profile_2: the national child-health programme (check-ups,
// vaccinations, dental care) as a timeline — upcoming first, the next one
// highlighted, then what's done. Tick an item off; the (i) shows what it is,
// who provides it, and lets you note when it's booked.

const DAY = 1000 * 60 * 60 * 24;

/** The date an item falls due: its planned date, or birthday + its age. */
function dueDate(item: ScheduleItem, birthday: string): Date {
  if (item.plannedAt) return new Date(item.plannedAt);
  const b = new Date(birthday);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + item.ageInMonths, Math.min(b.getUTCDate(), 28), 12));
}

export function HealthTimelineScreen() {
  const { t } = useT("children");
  const { childId } = useParams();
  const { data: child } = useChild(childId);
  const { data, isLoading } = useHealthSchedule(childId);
  if (!childId) return null;
  return (
    <div className="flex flex-col -mx-margin w-[calc(100%+2.5rem)] pb-space-xl">
      <ChildBar child={child} />
      <div className="flex flex-col gap-6 mx-margin pb-8 mt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface leading-tight">{t("health.title")}</h1>
        </div>
        {isLoading || !child ? (
          <Skeleton className="h-64 rounded-2xl bg-surface-container-lowest" />
        ) : !data || data.items.length === 0 ? (
          <EmptyCard icon="health_and_safety" text={t("health.empty")} />
        ) : (
          <Timeline child={child} items={data.items} />
        )}
      </div>
    </div>
  );
}

/** The sticky child bar (back, photo, name, parents, info). */
function ChildBar({ child }: { child: ChildDetail | undefined }) {
  const { t } = useT("children");
  const navigate = useNavigate();
  const { data: members } = useChildFamily(child?.id);
  return (
    <div className="flex items-center justify-between px-margin py-2.5 bg-surface border-b border-outline-variant/30 sticky top-20 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" aria-label={t("back")} onClick={() => navigate(-1)} className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full text-on-surface hover:bg-surface-container active:scale-95 transition-all">
          <Icon name="arrow_back_ios_new" className="text-[18px]" />
        </button>
        {child && (
          <>
            <PersonAvatar mediaId={child.profileImageUrl} initials={child.firstName.charAt(0)} className="w-8 h-8 ring-1 ring-outline-variant/40" />
            <div className="flex flex-col min-w-0">
              <h2 className="font-label-md text-label-md text-on-surface font-bold truncate leading-tight">{child.firstName}</h2>
              <div className="flex items-center gap-1 text-secondary truncate">
                <Icon name="supervisor_account" className="text-[13px]" />
                <p className="font-micro-meta text-micro-meta text-secondary truncate">{parentNames(members)}</p>
              </div>
            </div>
          </>
        )}
      </div>
      {child && (
        <button
          type="button"
          aria-label={t("health.medicalInfo")}
          onClick={() => navigate(paths.children.medical(child.id))}
          className="flex items-center justify-center w-8 h-8 rounded-full text-secondary hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all"
        >
          <Icon name="info" className="text-[20px]" />
        </button>
      )}
    </div>
  );
}

function Timeline({ child, items }: { child: ChildDetail; items: ScheduleItem[] }) {
  const { t } = useT("children");
  const toggle = useUpdateScheduleItem(child.id);
  const [open, setOpen] = useState<ScheduleItem | null>(null);
  const upcoming = items.filter((i) => !i.completed).sort((a, b) => dueDate(a, child.birthday).getTime() - dueDate(b, child.birthday).getTime());
  const done = items.filter((i) => i.completed).sort((a, b) => b.ageInMonths - a.ageInMonths);
  const header = (title: string, count: string) => (
    <div className="flex items-center justify-between">
      <h2 className="font-bold text-base text-on-surface tracking-tight">{title}</h2>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant uppercase tracking-wider">{count}</span>
    </div>
  );
  const setDone = (i: ScheduleItem, completed: boolean) => toggle.mutate({ templateId: i.templateId, sequence: i.sequence, body: { completed } });

  return (
    <>
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-3">
          {header(t("health.upcoming"), t("health.upcomingCount", { count: upcoming.length }))}
          <div className="flex flex-col gap-2.5">
            {upcoming.map((i, n) => (
              <Row key={`${i.templateId}-${i.sequence}`} item={i} child={child} next={n === 0} onToggle={() => setDone(i, true)} onInfo={() => setOpen(i)} />
            ))}
          </div>
        </div>
      )}
      {done.length > 0 && (
        <div className="flex flex-col gap-3">
          {header(t("health.completed"), t("health.completedCount", { count: done.length }))}
          <div className="flex flex-col gap-2.5">
            {done.map((i) => (
              <Row key={`${i.templateId}-${i.sequence}`} item={i} child={child} onToggle={() => setDone(i, false)} onInfo={() => setOpen(i)} />
            ))}
          </div>
        </div>
      )}
      {open && <InfoSheet item={open} child={child} onClose={() => setOpen(null)} />}
    </>
  );
}

function ageLabel(t: (k: string, o?: Record<string, unknown>) => string, months: number, completed: boolean) {
  if (months < 2) return t("health.ageWeeks", { count: Math.max(1, Math.round((months * 30.4375) / 7)) });
  if (months < 24) return t("health.ageMonths", { count: months });
  const years = Math.round((months / 12) * 2) / 2;
  return completed ? t("health.ageYears", { count: years }) : t("health.ageShort", { age: years });
}

function Row({ item, child, next, onToggle, onInfo }: { item: ScheduleItem; child: ChildDetail; next?: boolean; onToggle: () => void; onInfo: () => void }) {
  const { t } = useT("children");
  const fmt = useFormat();
  const when = item.completed && item.completedAt ? new Date(item.completedAt) : dueDate(item, child.birthday);
  // Within a year: month and year; further out: the year only (as the export does).
  const soon = Math.abs(when.getTime() - new Date().getTime()) < 365 * DAY || item.completed;
  const date = soon ? fmt.date(when, { month: "short", year: "numeric" }) : fmt.date(when, { year: "numeric" });

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3.5 rounded-2xl border border-outline-variant/30 shadow-xs hover:border-outline transition-all",
        item.completed ? "bg-mint" : "bg-surface-container-lowest",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {item.completed ? (
          <button type="button" aria-label={t("health.markUndone", { label: item.label })} onClick={onToggle} className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
            <Icon name="check" className="text-[14px]" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("health.markDone", { label: item.label })}
            onClick={onToggle}
            className="w-6 h-6 rounded-full border-2 border-outline-variant hover:border-primary flex items-center justify-center shrink-0 transition-colors"
          />
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-1.5 rounded-full font-micro-meta text-micro-meta uppercase tracking-wider",
                next ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {ageLabel(t, item.ageInMonths, item.completed)}
            </span>
            <span className={cn("font-micro-meta text-micro-meta text-secondary", (next || item.completed) && "font-bold")}>{date}</span>
          </div>
          <p className="font-label-md text-label-md text-on-surface font-bold truncate leading-tight mt-0.5">{item.label}</p>
          {item.completed && item.description && <p className="font-label-sm text-label-sm text-secondary truncate mt-0.5">{item.description}</p>}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("health.info", { label: item.label })}
        onClick={onInfo}
        className="flex items-center justify-center w-6 h-6 rounded-full text-secondary/50 hover:text-on-surface hover:bg-surface-container transition-colors shrink-0"
      >
        <Icon name="info" className="text-[11px]" />
      </button>
    </div>
  );
}

function InfoSheet({ item, child, onClose }: { item: ScheduleItem; child: ChildDetail; onClose: () => void }) {
  const { t } = useT("children");
  const update = useUpdateScheduleItem(child.id);
  const [planned, setPlanned] = useState((item.plannedAt ?? dueDate(item, child.birthday).toISOString()).slice(0, 10));
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg">
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{item.label}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-secondary">{item.description ?? t("health.noDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5">
          {item.provider && (
            <div className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
              <Icon name="local_hospital" className="text-[18px] text-secondary" />
              {t("health.provider", { provider: item.provider })}
            </div>
          )}
          {!item.completed && (
            <>
              <DateField id="planned" label={t("health.planned")} value={planned} onChange={setPlanned} />
              <SecondaryButton
                icon="event_available"
                disabled={update.isPending}
                onClick={() => update.mutate({ templateId: item.templateId, sequence: item.sequence, body: { plannedAt: `${planned}T12:00:00.000Z` } }, { onSuccess: onClose })}
              >
                {t("health.savePlanned")}
              </SecondaryButton>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
