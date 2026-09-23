import { CalendarShell } from "./calendar/CalendarShell";

// Thin route wrapper — all the calendar's actual state/data-loading/view
// logic lives in ./calendar/CalendarShell.tsx (+ MonthView/WeekView/List/
// SchoolView). See docs/Themes/Aura/kidcom_calendar_1 (Month), _2 (Week),
// _3 (Agenda/List) — School has no Aura mockup of its own, extended from
// the others' established layout and tokens.
export function CalendarPage() {
  return <CalendarShell />;
}
