import { CalendarShell } from "./calendar/CalendarShell";

// Thin route wrapper — all the calendar's actual state/data-loading/view
// logic lives in ./calendar/CalendarShell.tsx (+ MonthView/WeekView/
// ListView), replacing the old single-file week-strip+timeline
// implementation. See docs/stitch_splitkid/calendar_{month,week,list}_view.
export function CalendarPage() {
  return <CalendarShell />;
}
