import { useCallback, useState } from "react";

// Calendar filters (the "Categories" and "Types" dropdowns). Remembered for
// the browser session so switching Agenda/Week/Month keeps them.

export const CALENDAR_ITEM_TYPES = ["appointments", "tasks", "notes", "school", "holidays"] as const;
export type CalendarItemType = (typeof CALENDAR_ITEM_TYPES)[number];

export type CalendarFilters = {
  /** Category ids to show; empty = all categories */
  categoryIds: string[];
  /** Item types to show; empty = all types */
  types: CalendarItemType[];
};

const KEY = "kidcom.calendarFilters";
const EMPTY: CalendarFilters = { categoryIds: [], types: [] };

function read(): CalendarFilters {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<CalendarFilters> | null;
    return {
      categoryIds: Array.isArray(parsed?.categoryIds) ? parsed.categoryIds.filter((x): x is string => typeof x === "string") : [],
      types: Array.isArray(parsed?.types)
        ? parsed.types.filter((x): x is CalendarItemType => (CALENDAR_ITEM_TYPES as readonly string[]).includes(x))
        : [],
    };
  } catch {
    return EMPTY;
  }
}

export function useCalendarFilters() {
  const [filters, setFilters] = useState<CalendarFilters>(read);
  const update = useCallback((next: CalendarFilters) => {
    setFilters(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not remembered; still applied.
    }
  }, []);
  const showsType = useCallback((type: CalendarItemType) => filters.types.length === 0 || filters.types.includes(type), [filters]);
  const showsCategory = useCallback(
    (categoryId: string | null) => filters.categoryIds.length === 0 || (categoryId !== null && filters.categoryIds.includes(categoryId)),
    [filters],
  );
  return { filters, setFilters: update, showsType, showsCategory };
}
