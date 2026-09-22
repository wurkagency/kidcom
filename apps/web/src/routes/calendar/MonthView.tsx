import { useMemo } from "react";
import { DayPicker, type DayButton } from "react-day-picker";
import type { ComponentProps } from "react";
import type { ChildFamilyMember } from "@kidcom/shared";

import { Icon } from "../../components/Icon";
import { eventSpansDate, fromLocalDateOnly, toLocalDateOnly } from "../../lib/calendarDates";
import { CALENDAR_CATEGORY_META } from "../../lib/calendarCategories";
import { resolveParentTimeLabel } from "../../lib/parentLabel";
import type { CalendarEventWithChild } from "../../lib/mergeCalendarRanges";
import type { WeekStart } from "../../lib/preferences";
import type { CalendarViewHeaderProps } from "./CalendarShell";
import { CategoryFilterChips } from "./CategoryFilterChips";
import { ChildSelector } from "./ChildSelector";
import { EventCard } from "./EventCard";
import { ViewTabs } from "./ViewTabs";

// Matches docs/stitch_splitkid/calendar_month_view exactly: the
// "Showing Schedule For:" card + view tabs, a month headline with
// today/prev/next icon buttons, the Categories filter dropdown, a 7xN
// month grid with whole-week custody tinting (in-month days only — days
// from adjacent months stay plain muted numbers, no tint/no dots), and a
// "Day Quick Preview" panel below.
//
// The day grid itself is built on react-day-picker (the primitive
// shadcn/ui's Calendar component wraps) rather than a hand-rolled 42-cell
// array — used directly, not through the generated ui/calendar.tsx wrapper,
// since that wrapper's own Button/"cell-size" styling scaffold doesn't fit
// this grid's tint/dot/selection look. Its own nav/caption/weekday-label row
// are hidden (`classNames` below) since this view keeps its existing custom
// header for those.
//
// react-day-picker does its own grid math in local-Date terms, while this
// app's custody/event data is deliberately keyed by UTC calendar day (see
// calendarDates.ts). The bridge: every Date this view hands to or reads from
// react-day-picker is only ever built/read via *local* getters
// (fromLocalDateOnly/toLocalDateOnly) — used purely as a civil-calendar
// container, never compared as a real instant — so the ISO strings it
// produces line up with the ones custodyByDate/events are keyed by, exactly
// as the old UTC-Date-based grid did, just via local Dates instead.
export function MonthView({
  header,
  monthAnchorIso,
  weekStartPref,
  events,
  custodyByDate,
  family,
  currentUserId,
  selectedDate,
  isBothMode,
  onSelectDate,
  onOpenEvent,
  onToggleChecklistItem,
  onToggleConfirm,
}: {
  header: CalendarViewHeaderProps;
  monthAnchorIso: string;
  weekStartPref: WeekStart;
  events: CalendarEventWithChild[];
  custodyByDate: Record<string, string | null>;
  family: ChildFamilyMember[];
  currentUserId: string | null;
  selectedDate: string;
  isBothMode: boolean;
  onSelectDate: (iso: string) => void;
  onOpenEvent: (event: CalendarEventWithChild) => void;
  onToggleChecklistItem: (event: CalendarEventWithChild, itemId: string, isChecked: boolean) => void;
  onToggleConfirm: (event: CalendarEventWithChild, confirmed: boolean) => void;
}) {
  const monthAnchor = new Date(monthAnchorIso);
  const year = monthAnchor.getUTCFullYear();
  const month = monthAnchor.getUTCMonth();
  // A local Date carrying the same year/month as monthAnchorIso's UTC one —
  // only the calendar month matters to react-day-picker's `month` prop, and
  // this keeps every date it generates landing on the same civil-calendar
  // days the rest of the app already keys data by (see the file comment).
  const localMonthAnchor = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // The "own custom weekday-label row" the comment above promises never
  // actually existed — react-day-picker's built-in one is hidden
  // (`weekdays: "hidden"` below) and nothing replaced it, so the grid has
  // been missing its MO/TU/WE.../SU header entirely. 2024-01-07 is a known
  // Sunday (UTC), so offsetting from it and formatting each day's locale
  // weekday name gives the right 7 labels in the right order for either
  // week-start preference, without hardcoding English day names.
  const weekdayLabels = useMemo(() => {
    const startOffset = weekStartPref === "sunday" ? 0 : 1;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 7 + ((startOffset + i) % 7)));
      return d
        .toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })
        .replace(/\.$/, "")
        .slice(0, 2)
        .toUpperCase();
    });
  }, [weekStartPref]);

  // Background tint marks only actual custody days — days that carry a
  // CUSTODY-category event (handover/transition entries, created manually
  // per the redesign plan) — not every day of the resolved rotation, which
  // would tint the whole grid since a shared-custody schedule assigns
  // every day to somebody. Distinct owners still get a stable band tone
  // ("Dad's Time" vs "Mom's Time") without hardcoding which parentRole maps
  // to which — first owner seen gets the primary tone, the next gets the
  // secondary tone. Only considered for in-month days.
  //
  // Memoized together with the DayButton component that reads them:
  // react-day-picker's `components.DayButton` only ever receives the props
  // *it* defines (day/modifiers/...), not arbitrary extra ones passed to
  // <DayPicker>, so this data has to reach MonthDayButton via closure — and
  // a closure-capturing component must keep a stable identity across
  // renders that don't actually change this data, or every cell would
  // unmount/remount (losing focus) on every unrelated re-render.
  const { ownerTone, boundDayButton } = useMemo(() => {
    const tone: Record<string, "primary" | "secondary"> = {};
    const ownerMap = new Map<string, string | null>();
    const eventsMap = new Map<string, CalendarEventWithChild[]>();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toLocalDateOnly(new Date(year, month, d));
      const dayEvents = events.filter((e) => eventSpansDate(e, iso));
      eventsMap.set(iso, dayEvents);
      if (isBothMode) continue;
      const hasCustodyEvent = dayEvents.some((e) => e.category === "CUSTODY");
      if (!hasCustodyEvent) continue;
      const owner = custodyByDate[iso] ?? null;
      ownerMap.set(iso, owner);
      if (owner && !(owner in tone)) {
        tone[owner] = Object.keys(tone).length === 0 ? "primary" : "secondary";
      }
    }
    function DayButtonWithData(props: ComponentProps<typeof DayButton>) {
      return <MonthDayButton {...props} eventsByIso={eventsMap} ownerByIso={ownerMap} ownerTone={tone} />;
    }
    return { eventsByIso: eventsMap, ownerByIso: ownerMap, ownerTone: tone, boundDayButton: DayButtonWithData };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, custodyByDate, year, month, daysInMonth, isBothMode]);

  const selectedDayEvents = events.filter((e) => eventSpansDate(e, selectedDate));
  const selectedOwner = isBothMode ? null : custodyByDate[selectedDate] ?? null;
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 px-container-padding">
        <ChildSelector children={header.childrenList} selected={header.selectedChild} onSelect={header.onSelectChild} />
        <ViewTabs view={header.view} onChange={header.onChangeView} />
      </section>

      <div className="flex items-center justify-between px-container-padding">
        <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={header.onToday}
            aria-label="Jump to today"
            className="w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex items-center justify-center text-primary hover:bg-surface transition-colors"
          >
            <Icon name="today" className="text-[18px]" />
          </button>
          <button
            onClick={header.onPrev}
            aria-label="Previous month"
            className="w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex items-center justify-center text-on-surface-variant hover:bg-surface transition-colors"
          >
            <Icon name="chevron_left" className="text-[18px]" />
          </button>
          <button
            onClick={header.onNext}
            aria-label="Next month"
            className="w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex items-center justify-center text-on-surface-variant hover:bg-surface transition-colors"
          >
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="px-container-padding">
        <CategoryFilterChips selected={header.categoryFilter} onToggle={header.onToggleCategory} />
      </div>

      <div className="px-container-padding grid grid-cols-7 text-center mb-1">
        {weekdayLabels.map((label, i) => (
          <span key={i} className="font-micro-meta text-micro-meta text-on-surface-variant uppercase tracking-wider">
            {label}
          </span>
        ))}
      </div>

      <div className="px-container-padding">
        <DayPicker
          mode="single"
          month={localMonthAnchor}
          onMonthChange={() => {}}
          weekStartsOn={weekStartPref === "sunday" ? 0 : 1}
          showOutsideDays
          required
          selected={fromLocalDateOnly(selectedDate)}
          onSelect={(date) => {
            if (date) onSelectDate(toLocalDateOnly(date));
          }}
          classNames={{
            months: "w-full",
            month: "w-full",
            nav: "hidden",
            month_caption: "hidden",
            weekdays: "hidden",
            // react-day-picker v10 renders a real <table>/<tr>/<td> grid
            // (role="grid", for a11y) — CSS Grid/Flex on the <tr> itself
            // ("week") doesn't reliably distribute column widths across
            // browsers, so this leans on native table layout instead:
            // table-fixed divides the table into 7 equal columns (always
            // exactly 7 <td>s per row) and border-spacing replicates the
            // original grid's `gap-1` without needing border-collapse.
            month_grid: "w-full table-fixed border-spacing-1",
            day: "p-0",
          }}
          components={{ DayButton: boundDayButton }}
        />
      </div>

      {!isBothMode && Object.keys(ownerTone).length > 0 && (
        <div className="flex gap-4 px-container-padding">
          {Object.entries(ownerTone).map(([userId, tone]) => (
            <div key={userId} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${tone === "primary" ? "bg-primary-fixed/40" : "bg-secondary-container"}`} />
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {resolveParentTimeLabel(family, userId)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mx-container-padding bg-surface-container-low rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface">
            {new Date(selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </h3>
          <div className="flex items-center gap-2">
            {selectedOwner && (
              <span className="font-label-sm text-label-sm text-primary bg-primary-fixed/30 px-3 py-1 rounded-full">
                {resolveParentTimeLabel(family, selectedOwner)}
              </span>
            )}
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {selectedDayEvents.length} event{selectedDayEvents.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {selectedDayEvents.length === 0 && (
            <p className="font-body-md text-body-md text-on-surface-variant">Nothing scheduled.</p>
          )}
          {selectedDayEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              variant="compact"
              family={family}
              currentUserId={currentUserId}
              onOpen={onOpenEvent}
              onToggleChecklistItem={onToggleChecklistItem}
              onToggleConfirm={onToggleConfirm}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type MonthDayButtonProps = ComponentProps<typeof DayButton> & {
  eventsByIso?: Map<string, CalendarEventWithChild[]>;
  ownerByIso?: Map<string, string | null>;
  ownerTone?: Record<string, "primary" | "secondary">;
};

// Renders one grid cell exactly as the original 42-cell array version did —
// same tint/selection/dot classes — just fed by react-day-picker's own
// per-cell `day`/`modifiers` instead of a hand-rolled array index.
function MonthDayButton({ day, modifiers, eventsByIso, ownerByIso, ownerTone, className, ...props }: MonthDayButtonProps) {
  const iso = toLocalDateOnly(day.date);
  const inMonth = !modifiers.outside;
  const isSelected = modifiers.selected;
  const dayEvents = inMonth ? eventsByIso?.get(iso) ?? [] : [];
  const owner = inMonth ? ownerByIso?.get(iso) ?? null : null;
  const tone = owner && ownerTone ? ownerTone[owner] : null;

  return (
    <button
      {...props}
      className={`aspect-square w-full rounded-xl flex flex-col items-center justify-center gap-0.5 relative transition-all ${
        inMonth
          ? tone === "primary"
            ? "bg-primary-fixed/25"
            : tone === "secondary"
              ? "bg-secondary-container/50"
              : ""
          : ""
      } ${isSelected ? "bg-primary shadow-md scale-105 z-10" : ""}`}
    >
      <span
        className={`font-label-md text-label-md ${
          isSelected ? "text-on-primary" : inMonth ? "text-on-surface" : "text-on-surface-variant opacity-30"
        }`}
      >
        {day.date.getDate()}
      </span>
      {inMonth && dayEvents.length > 0 && (
        <div className="flex gap-0.5">
          {dayEvents.slice(0, 3).map((e, idx) => (
            <span
              key={idx}
              className={`w-1 h-1 rounded-full ${isSelected ? "bg-on-primary" : CALENDAR_CATEGORY_META[e.category].dotClass}`}
            />
          ))}
        </div>
      )}
    </button>
  );
}
