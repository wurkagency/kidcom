import type { ChildFamilyMember } from "@kidcom/shared";

import { Icon } from "../../components/Icon";
import { addDays, eventSpansDate, startOfWeek, toDateOnly } from "../../lib/calendarDates";
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
  const monthStart = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), 1));
  const gridStart = startOfWeek(monthStart, weekStartPref);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = monthAnchor.getUTCMonth();

  // Background tint marks only actual custody days — days that carry a
  // CUSTODY-category event (handover/transition entries, created manually
  // per the redesign plan) — not every day of the resolved rotation, which
  // would tint the whole grid since a shared-custody schedule assigns
  // every day to somebody. Distinct owners still get a stable band tone
  // ("Dad's Time" vs "Mom's Time") without hardcoding which parentRole maps
  // to which — first owner seen gets the primary tone, the next gets the
  // secondary tone. Only considered for in-month days.
  const ownerTone: Record<string, "primary" | "secondary"> = {};
  if (!isBothMode) {
    for (const day of days) {
      if (day.getUTCMonth() !== month) continue;
      const iso = toDateOnly(day);
      const hasCustodyEvent = events.some((e) => e.category === "CUSTODY" && eventSpansDate(e, iso));
      if (!hasCustodyEvent) continue;
      const owner = custodyByDate[iso];
      if (owner && !(owner in ownerTone)) {
        ownerTone[owner] = Object.keys(ownerTone).length === 0 ? "primary" : "secondary";
      }
    }
  }

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

      <div className="grid grid-cols-7 gap-1 px-container-padding">
        {days.map((day) => {
          const iso = toDateOnly(day);
          const inMonth = day.getUTCMonth() === month;
          const isSelected = iso === selectedDate;
          const dayEvents = inMonth ? events.filter((e) => eventSpansDate(e, iso)) : [];
          const hasCustodyEvent = inMonth && !isBothMode && dayEvents.some((e) => e.category === "CUSTODY");
          const owner = hasCustodyEvent ? custodyByDate[iso] ?? null : null;
          const tone = owner ? ownerTone[owner] : null;
          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 relative transition-all ${
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
                {day.getUTCDate()}
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
        })}
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
