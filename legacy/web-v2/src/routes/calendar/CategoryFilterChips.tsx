import { useState } from "react";
import type { CalendarEventCategory } from "@kidcom/shared";

import { Icon } from "../../components/Icon";
import { CALENDAR_CATEGORY_META, CALENDAR_FILTERABLE_CATEGORIES } from "../../lib/calendarCategories";

// Matches docs/Themes/Aura/kidcom_calendar_1's "Categories" filter (a
// "Categories · 3" pill that expands into a wrap-chip list, each toggleable
// independently with a checkmark on the selected ones) — reused identically
// across Month/Week/List/School since it's the same control everywhere.
// The mockups also show a second "Types" pill alongside it with no
// corresponding data axis in CalendarEvent (category is the only
// classification field) — left out rather than faked; see the audit notes.
export function CategoryFilterChips({
  selected,
  onToggle,
}: {
  selected: Set<CalendarEventCategory>;
  onToggle: (category: CalendarEventCategory) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = CALENDAR_FILTERABLE_CATEGORIES.length;
  const selectedCount = CALENDAR_FILTERABLE_CATEGORIES.filter((c) => selected.has(c)).length;
  const summary = selectedCount === total ? `All ${total} selected` : `${selectedCount} of ${total} selected`;

  return (
    <div className="w-full flex flex-col gap-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm hover:border-outline-variant/60 focus:outline-none transition-all"
      >
        <div className="flex items-center gap-2 text-on-surface">
          <Icon name="tune" className="text-primary text-[20px]" />
          <span className="font-label-md text-label-md font-semibold text-on-surface">Categories</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant ml-1 font-normal">({summary})</span>
        </div>
        <Icon
          name={expanded ? "expand_less" : "expand_more"}
          className="text-[20px] text-on-surface-variant transition-colors"
        />
      </button>
      {expanded && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-1">
          {CALENDAR_FILTERABLE_CATEGORIES.map((category) => {
            const meta = CALENDAR_CATEGORY_META[category];
            const isSelected = selected.has(category);
            return (
              <button
                key={category}
                onClick={() => onToggle(category)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-colors ${
                  isSelected ? meta.badgeClass : "bg-surface-container text-on-surface-variant"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                <span>{meta.label}</span>
                {isSelected && <Icon name="check" className="text-[14px]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
