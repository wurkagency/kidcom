import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

export type CalendarViewMode = "month" | "week" | "list";

const TABS: { value: CalendarViewMode; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "list", label: "List" },
];

// Month/Week/List pill tab switcher — identical markup across all three
// mockups (docs/stitch_splitkid/calendar_{month,week,list}_view). Built on
// Radix's ToggleGroup primitive (@radix-ui/react-toggle-group, same one
// SegmentedControl.tsx uses) composed directly rather than through shadcn/ui's
// generated wrapper, same reasoning as SegmentedControl: keeps the exact
// current classNames so every skin renders identically to the hand-rolled
// version it replaces.
export function ViewTabs({ view, onChange }: { view: CalendarViewMode; onChange: (view: CalendarViewMode) => void }) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={view}
      onValueChange={(next) => {
        // Radix lets the selected item toggle itself off (empty string) —
        // this control always has exactly one view active, so ignore that.
        if (next) onChange(next as CalendarViewMode);
      }}
      className="flex items-center bg-surface-container-low p-1 rounded-full w-full"
    >
      {TABS.map((tab) => (
        <ToggleGroupPrimitive.Item
          key={tab.value}
          value={tab.value}
          className={`flex-1 py-1.5 text-center rounded-full font-label-md text-label-md transition-all ${
            view === tab.value ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {tab.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
