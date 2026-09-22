import type { ChildFamilyMember } from "@kidcom/shared";
import { resolveCustodyBlockProgress, type CustodyPlanLike } from "@kidcom/shared";

import { Icon } from "../../components/Icon";
import { addDays, DAY_LABELS_MONDAY, DAY_LABELS_SUNDAY, eventSpansDate, startOfWeek, toDateOnly } from "../../lib/calendarDates";
import { resolveParentTimeLabel } from "../../lib/parentLabel";
import type { CalendarEventWithChild } from "../../lib/mergeCalendarRanges";
import type { WeekStart } from "../../lib/preferences";
import type { CalendarViewHeaderProps } from "./CalendarShell";
import { CategoryFilterChips } from "./CategoryFilterChips";
import { ChildSelector } from "./ChildSelector";
import { EventCard } from "./EventCard";
import { ViewTabs } from "./ViewTabs";

// Matches docs/stitch_splitkid/calendar_week_view exactly: the "Showing
// Schedule For:" card + view tabs, a week-range headline with
// today/prev/next icon buttons, the Categories filter dropdown, a custody
// rotation banner ("Dad's Full Week Rotation — Day 4 of 7") over a 7-day
// dot strip, and a date-grouped timeline of the week's events below it.
export function WeekView({
  header,
  anchorDate,
  weekStartPref,
  events,
  custodyByDate,
  family,
  currentUserId,
  custodyPlan,
  isBothMode,
  selectedDate,
  onSelectDate,
  onOpenEvent,
  onToggleChecklistItem,
  onToggleConfirm,
}: {
  header: CalendarViewHeaderProps;
  anchorDate: string;
  weekStartPref: WeekStart;
  events: CalendarEventWithChild[];
  custodyByDate: Record<string, string | null>;
  family: ChildFamilyMember[];
  currentUserId: string | null;
  custodyPlan: CustodyPlanLike | null;
  isBothMode: boolean;
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onOpenEvent: (event: CalendarEventWithChild) => void;
  onToggleChecklistItem: (event: CalendarEventWithChild, itemId: string, isChecked: boolean) => void;
  onToggleConfirm: (event: CalendarEventWithChild, confirmed: boolean) => void;
}) {
  const weekStartDate = startOfWeek(new Date(anchorDate), weekStartPref);
  const weekEndDate = addDays(weekStartDate, 6);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const dayLabels = weekStartPref === "sunday" ? DAY_LABELS_SUNDAY : DAY_LABELS_MONDAY;

  const todayProgress =
    !isBothMode && custodyPlan ? resolveCustodyBlockProgress(custodyPlan, new Date(anchorDate)) : null;
  const rotationLabel = todayProgress
    ? `${resolveParentTimeLabel(family, todayProgress.userId)} Full Week Rotation — Day ${todayProgress.dayOfBlock} of ${todayProgress.blockLengthDays}`
    : null;

  const sameMonth = weekStartDate.getUTCMonth() === weekEndDate.getUTCMonth();
  // A {day, year} skeleton with no month is unusual enough that some locales
  // (confirmed on da-DK) fall back to a verbose, broken-looking label
  // instead of a clean date — e.g. "2026 (dag: 27.)" instead of "27". Always
  // including the month on the end date (even in the same-month case, where
  // it's technically redundant with the start date's) sidesteps that
  // fallback entirely and reads fine either way: "21 – 27. sep. 2026".
  const weekRangeLabel = sameMonth
    ? `${weekStartDate.toLocaleDateString(undefined, { day: "numeric", timeZone: "UTC" })} – ${weekEndDate.toLocaleDateString(
        undefined,
        { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
      )}`
    : `${weekStartDate.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} – ${weekEndDate.toLocaleDateString(
        undefined,
        { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
      )}`;

  const todayIso = toDateOnly(new Date());

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 px-container-padding">
        <ChildSelector children={header.childrenList} selected={header.selectedChild} onSelect={header.onSelectChild} />
        <ViewTabs view={header.view} onChange={header.onChangeView} />
      </section>

      <div className="flex items-center justify-between px-container-padding">
        <span className="font-headline-md text-headline-md text-on-surface tracking-tight">{weekRangeLabel}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={header.onToday}
            aria-label="Jump to today"
            className="w-9 h-9 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex items-center justify-center text-primary hover:bg-surface transition-colors"
          >
            <Icon name="calendar_today" className="text-[18px]" />
          </button>
          <button
            onClick={header.onPrev}
            aria-label="Previous week"
            className="w-9 h-9 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex items-center justify-center text-on-surface-variant hover:bg-surface transition-colors"
          >
            <Icon name="chevron_left" className="text-[18px]" />
          </button>
          <button
            onClick={header.onNext}
            aria-label="Next week"
            className="w-9 h-9 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex items-center justify-center text-on-surface-variant hover:bg-surface transition-colors"
          >
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="px-container-padding">
        <CategoryFilterChips selected={header.categoryFilter} onToggle={header.onToggleCategory} />
      </div>

      {rotationLabel && (
        <div className="mx-container-padding bg-primary/10 rounded-full px-4 py-2 self-start">
          <p className="font-label-sm text-label-sm text-primary font-semibold">{rotationLabel}</p>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5 px-container-padding">
        {weekDays.map((day, i) => {
          const iso = toDateOnly(day);
          const dayEvents = events.filter((e) => eventSpansDate(e, iso));
          // Background tint marks only actual custody days — days carrying a
          // CUSTODY-category event — not every day of the resolved
          // rotation, which would tint the whole strip since a
          // shared-custody schedule assigns every day to somebody.
          const hasCustodyEvent = !isBothMode && dayEvents.some((e) => e.category === "CUSTODY");
          const isToday = iso === todayIso;
          const isSelected = iso === selectedDate;
          return (
            <button
              key={iso}
              onClick={() => {
                onSelectDate(iso);
                document.getElementById(`week-day-${iso}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition-all ${
                isSelected
                  ? "bg-primary shadow-md scale-105 z-10"
                  : isToday
                    ? "ring-2 ring-primary/40"
                    : hasCustodyEvent
                      ? "bg-primary-fixed/15"
                      : ""
              }`}
            >
              <span className={`font-label-sm text-label-sm ${isSelected ? "text-on-primary" : "text-on-surface-variant"}`}>
                {dayLabels[i]}
              </span>
              <span className={`font-label-md text-label-md font-semibold ${isSelected ? "text-on-primary" : "text-on-surface"}`}>
                {day.getUTCDate()}
              </span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5">
                  {dayEvents.slice(0, 2).map((e, idx) => (
                    <span key={idx} className={`w-1 h-1 rounded-full ${isSelected ? "bg-on-primary" : "bg-tertiary"}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-5 px-container-padding pb-4">
        {weekDays.map((day) => {
          const iso = toDateOnly(day);
          const dayEvents = events.filter((e) => eventSpansDate(e, iso));
          if (dayEvents.length === 0) return null;
          const owner = isBothMode ? null : custodyByDate[iso] ?? null;
          return (
            <div key={iso} id={`week-day-${iso}`} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
                </h3>
                {owner && (
                  <span className="font-label-sm text-label-sm text-primary bg-primary-fixed/30 px-3 py-1 rounded-full">
                    {resolveParentTimeLabel(family, owner)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="full"
                    family={family}
                    currentUserId={currentUserId}
                    onOpen={onOpenEvent}
                    onToggleChecklistItem={onToggleChecklistItem}
                    onToggleConfirm={onToggleConfirm}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">Nothing scheduled this week.</p>
        )}
      </div>
    </div>
  );
}
