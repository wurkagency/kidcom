import { isCustodyHandoverDay } from "@kidcom/shared";
import type { ChildFamilyMember } from "@kidcom/shared";

import { Icon } from "../../components/Icon";
import { eventSpansDate, toDateOnly } from "../../lib/calendarDates";
import { resolveParentTimeLabel } from "../../lib/parentLabel";
import { formatRelativeTime } from "../../lib/relativeTime";
import type { CalendarEventWithChild } from "../../lib/mergeCalendarRanges";
import type { CalendarViewHeaderProps } from "./CalendarShell";
import { CategoryFilterChips } from "./CategoryFilterChips";
import { ChildSelector } from "./ChildSelector";
import { EventCard } from "./EventCard";
import { ViewTabs } from "./ViewTabs";

// Matches docs/stitch_splitkid/calendar_list_view: a combined "Showing
// Schedule For:" + freshness card with the view tabs inside it, one
// top-level month headline + today/prev/next nav bar (the mockup repeats
// nav buttons per date-group header, which doesn't make sense to
// replicate literally for a real data-driven list — one shared nav is
// used instead), the Categories filter dropdown, and a flat list grouped
// by date under headers badged "With Dad"/"With Mom"/"Custody Handover
// Day". The mockup's floating FAB is dropped — CalendarShell's shared
// "Add Appointment / Event" button (placed above the swap card) covers it.
export function ListView({
  header,
  monthAnchorIso,
  rangeStartIso,
  rangeEndIso,
  events,
  custodyByDate,
  family,
  currentUserId,
  isBothMode,
  lastUpdatedAt,
  onOpenEvent,
  onToggleChecklistItem,
  onToggleConfirm,
}: {
  header: CalendarViewHeaderProps;
  monthAnchorIso: string;
  rangeStartIso: string;
  rangeEndIso: string;
  events: CalendarEventWithChild[];
  custodyByDate: Record<string, string | null>;
  family: ChildFamilyMember[];
  currentUserId: string | null;
  isBothMode: boolean;
  lastUpdatedAt: Date;
  onOpenEvent: (event: CalendarEventWithChild) => void;
  onToggleChecklistItem: (event: CalendarEventWithChild, itemId: string, isChecked: boolean) => void;
  onToggleConfirm: (event: CalendarEventWithChild, confirmed: boolean) => void;
}) {
  const dateIsos: string[] = [];
  for (let d = new Date(rangeStartIso); toDateOnly(d) <= rangeEndIso; d = new Date(d.getTime() + 86400000)) {
    dateIsos.push(toDateOnly(d));
  }
  const datesWithEvents = dateIsos.filter((iso) => events.some((e) => eventSpansDate(e, iso)));
  const monthLabel = new Date(monthAnchorIso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 px-container-padding">
        <ChildSelector children={header.childrenList} selected={header.selectedChild} onSelect={header.onSelectChild} />
        <ViewTabs view={header.view} onChange={header.onChangeView} />
      </section>

      <div className="flex items-center justify-between px-container-padding">
        <div className="flex flex-col">
          <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">{monthLabel}</h2>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Updated {formatRelativeTime(lastUpdatedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={header.onToday}
            aria-label="Jump to today"
            className="p-1.5 rounded-full hover:bg-surface-container-low text-primary transition-colors"
          >
            <Icon name="today" className="text-[20px]" />
          </button>
          <button
            onClick={header.onPrev}
            aria-label="Previous month"
            className="p-1.5 rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
          >
            <Icon name="chevron_left" className="text-[20px]" />
          </button>
          <button
            onClick={header.onNext}
            aria-label="Next month"
            className="p-1.5 rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
          >
            <Icon name="chevron_right" className="text-[20px]" />
          </button>
        </div>
      </div>

      <div className="px-container-padding">
        <CategoryFilterChips selected={header.categoryFilter} onToggle={header.onToggleCategory} />
      </div>

      <div className="flex flex-col">
        {datesWithEvents.length === 0 && (
          <p className="px-container-padding font-body-md text-body-md text-on-surface-variant">
            Nothing scheduled in this range.
          </p>
        )}
        {datesWithEvents.map((iso) => {
          const dayEvents = events.filter((e) => eventSpansDate(e, iso));
          const owner = isBothMode ? null : custodyByDate[iso] ?? null;
          const isHandover = !isBothMode && isCustodyHandoverDay(custodyByDate, iso);
          return (
            <div key={iso} className="flex flex-col">
              <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-md px-container-padding py-2 flex items-center justify-between">
                <h3 className="font-label-md text-label-md text-on-surface">
                  {new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </h3>
                {isHandover ? (
                  <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-primary-fixed bg-primary-fixed px-2 py-1 rounded-full">
                    <Icon name="swap_horiz" className="text-[14px]" />
                    Custody Handover Day
                  </span>
                ) : (
                  owner && (
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-secondary-container bg-secondary-container px-2 py-1 rounded-full">
                      <Icon name="cottage" className="text-[14px]" />
                      With {resolveParentTimeLabel(family, owner).replace("'s Time", "")}
                    </span>
                  )
                )}
              </div>
              <div className="flex flex-col gap-3 px-container-padding pb-4">
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
      </div>
    </div>
  );
}
