import { ViewSwitcherDropdown } from "../../components/ViewSwitcherDropdown";

export type CalendarViewMode = "month" | "week" | "list" | "school";

// "list" keeps its internal value (every ?view=list link/preference in the
// app already uses it) but reads as "Agenda" in the switcher, matching
// docs/Themes/Aura/kidcom_calendar_1/code.html's dropdown exactly (Agenda
// default, then Week, Month, School).
const OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "list", label: "Agenda" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "school", label: "School" },
];

// Was a Month/Week/List segmented pill switcher — replaced by Aura's
// "Switch View" dropdown (see ViewSwitcherDropdown.tsx) across every skin,
// per the full structural adoption. Same props as before, so MonthView/
// WeekView/ListView/SchoolView's call sites didn't need to change.
export function ViewTabs({ view, onChange }: { view: CalendarViewMode; onChange: (view: CalendarViewMode) => void }) {
  return (
    <ViewSwitcherDropdown options={OPTIONS} value={view} onChange={onChange} defaultValue="list" />
  );
}
