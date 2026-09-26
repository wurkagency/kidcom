import { useMemo } from "react";
import type { CalendarEventDto, CategoryDto, ChildFamilyMember, ChildNoteDto, ChildOverview, OverviewResponse, TaskDto } from "@kinnd/shared";
import { dateKey, useActiveChildren, useCategoryMap, useOverview, type CalendarItemType, type DateKey } from "@kinnd/core";

import type { DayMarks } from "./DateStrip";

// Flattens the per-child overview into what the Today and calendar screens
// draw: one list of events, tasks and notes across the selected children.

type Filters = {
  showsType: (type: CalendarItemType) => boolean;
  showsCategory: (categoryIds: string[]) => boolean;
};

const ALL: Filters = { showsType: () => true, showsCategory: () => true };

const eventDay = (e: CalendarEventDto) => dateKey(e.startsAt);
const byStart = (a: CalendarEventDto, b: CalendarEventDto) =>
  Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt);

export function useCalendarData(range: { from: DateKey; to: DateKey }, filters: Filters = ALL) {
  const { selected, children, filter } = useActiveChildren();
  const childIds = filter.kind === "all" ? null : selected.map((c) => c.id);
  const query = useOverview(range, childIds);
  const categories = useCategoryMap();

  const data = useMemo(() => build(query.data, categories, filters), [query.data, categories, filters]);
  const childName = (childId: string) => children.find((c) => c.id === childId)?.firstName;
  return { ...data, query, categories, childName, today: query.data?.today ?? dateKey() };
}

function build(overview: OverviewResponse | undefined, categories: Map<string, CategoryDto>, { showsType, showsCategory }: Filters) {
  const kids: ChildOverview[] = overview?.children ?? [];
  const members = new Map<string, ChildFamilyMember[]>(kids.map((c) => [c.childId, c.members]));

  const events = kids
    .flatMap((c) => c.events)
    .filter((e) => showsType(e.kind === "NATIONAL_HOLIDAY" ? "holidays" : "appointments") && showsCategory(e.categoryIds))
    .sort(byStart);
  // A holiday is seeded once per child; show it once.
  const seen = new Set<string>();
  const uniqueEvents = events.filter((e) => {
    if (e.kind !== "NATIONAL_HOLIDAY") return true;
    const key = `${e.title}|${eventDay(e)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const tasks: TaskDto[] = showsType("tasks") ? kids.flatMap((c) => c.tasks).filter((x) => showsCategory(x.categoryIds)) : [];
  const notes: ChildNoteDto[] = showsType("notes")
    ? kids
        .flatMap((c) => c.notes)
        .filter((n) => showsCategory(n.categoryIds))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const lessons = showsType("school") ? kids.flatMap((c) => c.lessons) : [];

  const marks: DayMarks = {};
  for (const e of uniqueEvents) {
    const day = eventDay(e);
    const tone = e.categoryIds.length ? categories.get(e.categoryIds[0]!)?.tone : undefined;
    (marks[day] ??= []).push({ rose: tone === "ROSE" });
  }
  for (const x of tasks) {
    if (x.dueOn && !x.completedAt) (marks[x.dueOn] ??= []).push({ rose: false });
  }

  return {
    kids,
    events: uniqueEvents,
    tasks,
    notes,
    lessons,
    marks,
    membersFor: (childId: string) => members.get(childId) ?? [],
    eventsOn: (day: DateKey) => uniqueEvents.filter((e) => eventDay(e) === day),
    /** Open tasks due by `day` (or undated), plus tasks ticked off that day */
    tasksFor: (day: DateKey) =>
      tasks.filter((x) => (x.completedAt ? dateKey(x.completedAt) === day : !x.dueOn || x.dueOn <= day)),
  };
}
