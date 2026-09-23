import { addDays, eventSpansDate, startOfWeek, toDateOnly } from "../../lib/calendarDates";
import type { WeekStart } from "../../lib/preferences";
import type { CalendarEventWithChild } from "../../lib/mergeCalendarRanges";
import type { CalendarViewHeaderProps } from "./CalendarShell";
import { ChildSelector } from "./ChildSelector";
import { EventCard } from "./EventCard";
import { ViewTabs } from "./ViewTabs";

// The "School" view from the Aura dropdown (ViewTabs.tsx) — a week's worth
// of SCHOOL-category events only, grouped by weekday, styled like a class
// schedule rather than a general agenda. There's no separate "class
// schedule" data model — this filters the same CalendarEventDto rows every
// other view uses down to category === "SCHOOL", so it only shows anything
// once a family has actually entered school events (drop-off, classes,
// pickup) on the calendar. Deliberately ignores the category filter chips
// (this view IS a category filter) and always spans the full week
// regardless of which day is selected, per CalendarShell's range logic.
export function SchoolView({
  header,
  anchorDate,
  weekStartPref,
  events,
  currentUserId,
  onOpenEvent,
  onToggleChecklistItem,
}: {
  header: CalendarViewHeaderProps;
  anchorDate: string;
  weekStartPref: WeekStart;
  events: CalendarEventWithChild[];
  currentUserId: string | null;
  onOpenEvent: (event: CalendarEventWithChild) => void;
  onToggleChecklistItem: (event: CalendarEventWithChild, itemId: string, isChecked: boolean) => void;
}) {
  const weekStartDate = startOfWeek(new Date(anchorDate), weekStartPref);
  const days = Array.from({ length: 7 }, (_, i) => toDateOnly(addDays(weekStartDate, i)));
  const schoolEvents = events.filter((e) => e.category === "SCHOOL");
  const weekLabel = `${weekStartDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(
    weekStartDate,
    6
  ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 px-container-padding">
        <ChildSelector children={header.childrenList} selected={header.selectedChild} onSelect={header.onSelectChild} />
        <ViewTabs view={header.view} onChange={header.onChangeView} />
      </section>

      <div className="flex items-center justify-between px-container-padding">
        <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">{weekLabel}</h2>
        <button
          onClick={header.onToday}
          aria-label="Jump to this week"
          className="p-1.5 rounded-full hover:bg-surface-container-low text-primary transition-colors"
        >
          <span className="font-label-sm text-label-sm">This week</span>
        </button>
      </div>

      <div className="flex flex-col px-container-padding pb-4 gap-5">
        {schoolEvents.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">
            No school events on the calendar this week.
          </p>
        )}
        {days.map((iso) => {
          const dayEvents = schoolEvents
            .filter((e) => eventSpansDate(e, iso))
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
          if (dayEvents.length === 0) return null;
          return (
            <div key={iso} className="flex flex-col gap-2">
              <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                {new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              </h3>
              <div className="flex flex-col gap-2">
                {dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="compact"
                    family={[]}
                    currentUserId={currentUserId}
                    onOpen={onOpenEvent}
                    onToggleChecklistItem={onToggleChecklistItem}
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
