import type { CalendarEventDto, CalendarRangeResponse } from "@kidcom/shared";

// The calendar views work with events tagged by which child's row they came
// from — needed so a tap on an event (including a merged "Both" card) can
// navigate to the right /children/:childId/calendar-events/:id/edit route.
// CalendarEventDto itself carries no childId (a single-child range response
// doesn't need one), so this is a client-only extension, not a server
// contract change.
export type CalendarEventWithChild = CalendarEventDto & { childId: string };

export type MergedCalendarRange = {
  custodyByDate: Record<string, string | null>;
  events: CalendarEventWithChild[];
};

// Merges two (or more) children's CalendarRangeResponse for the "Both"
// selector — keeps the existing duplicate-row-per-child data model (one
// CalendarEvent row per assigned child, per EventFormPage's "Both"
// create-time picker) rather than introducing a many-to-many relation; this
// just dedupes the display side so a "Both"-assigned event doesn't show as
// two identical cards. Two events are considered "the same" when they share
// (title, category, startsAt, endsAt) — the same key EventFormPage's create
// flow produces one identical payload per child under. Whichever child's
// copy is encountered first wins the childId tag (and is what an edit tap
// will act on — see the calendar redesign plan's open issue about "Both"
// mode only editing one underlying row).
//
// custodyByDate is unioned (a later child's value wins on any date both
// happen to report — in practice each child has its own independent plan,
// so overlap is rare); a genuine conflict is intentionally not resolved
// here.
function eventKey(e: CalendarEventDto): string {
  return `${e.title}::${e.category}::${e.startsAt}::${e.endsAt ?? ""}`;
}

export function mergeCalendarRanges(
  ranges: { childId: string; range: CalendarRangeResponse }[]
): MergedCalendarRange {
  const custodyByDate: Record<string, string | null> = {};
  const seen = new Map<string, CalendarEventWithChild>();

  for (const { childId, range } of ranges) {
    for (const [date, owner] of Object.entries(range.custodyByDate)) {
      custodyByDate[date] = owner;
    }
    for (const event of range.events) {
      const key = eventKey(event);
      if (!seen.has(key)) seen.set(key, { ...event, childId });
    }
  }

  const events = Array.from(seen.values()).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  return { custodyByDate, events };
}

// Single-child helper so callers don't need a separate code path when only
// one child is selected.
export function tagRangeWithChild(childId: string, range: CalendarRangeResponse): MergedCalendarRange {
  return mergeCalendarRanges([{ childId, range }]);
}
