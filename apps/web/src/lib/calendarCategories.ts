import type { CalendarEventCategory } from "@kidcom/shared";

// One metadata table per category, matching the exact 5-category system
// shown in docs/stitch_splitkid/calendar_month_view's "Categories" dropdown
// (Custody / Medical / School / Activities / Holidays, each with a specific
// dot color) — that dropdown is the one place across all three mockups
// where every category's color is spelled out explicitly, so it's used here
// as the canonical source rather than the individual event-card colors,
// which are inconsistent between the mockups (e.g. Week/List's Medical
// badge uses a literal blue hex while Month's dropdown uses the `tertiary`
// token). School and Activities aren't in the app's Material token palette,
// so they get their own `category-school`/`category-activity` CSS-variable
// tokens (src/index.css) instead of literal hex, so a skin can recolor them.
export type CalendarCategoryMeta = {
  label: string;
  icon: string;
  dotClass: string;
  // Full pill badge classes (bg + text), as used on event cards' top-left
  // category badge (see calendar_week_view's timeline-event cards).
  badgeClass: string;
  // Left accent bar shown on cards that get one (Medical/Custody in the
  // mockups) — empty string means no accent bar.
  accentClass: string;
  // Colored icon class used for the location/detail row icon.
  iconAccentClass: string;
};

export const CALENDAR_CATEGORY_META: Record<CalendarEventCategory, CalendarCategoryMeta> = {
  CUSTODY: {
    label: "Custody",
    icon: "swap_horiz",
    dotClass: "bg-primary",
    badgeClass: "bg-primary-fixed text-on-primary-fixed",
    accentClass: "bg-primary",
    iconAccentClass: "text-primary",
  },
  // Not one of the mockups' 5 filterable categories — excluded from
  // CALENDAR_FILTERABLE_CATEGORIES below and always shown, same treatment
  // as HOLIDAY (see the calendar redesign plan's open issue #7).
  APPOINTMENT: {
    label: "Appointment",
    icon: "event",
    dotClass: "bg-primary-container",
    badgeClass: "bg-surface-container text-on-surface-variant",
    accentClass: "",
    iconAccentClass: "text-primary",
  },
  MEDICAL: {
    label: "Medical",
    icon: "medical_services",
    dotClass: "bg-tertiary",
    badgeClass: "bg-tertiary-fixed text-on-tertiary-fixed",
    accentClass: "bg-tertiary",
    iconAccentClass: "text-tertiary",
  },
  SCHOOL: {
    label: "School",
    icon: "school",
    dotClass: "bg-category-school",
    badgeClass: "bg-category-school/15 text-on-category-school",
    accentClass: "",
    iconAccentClass: "text-on-category-school",
  },
  ACTIVITY: {
    label: "Activities",
    icon: "sports_soccer",
    dotClass: "bg-category-activity",
    badgeClass: "bg-category-activity/15 text-on-category-activity",
    accentClass: "",
    iconAccentClass: "text-on-category-activity",
  },
  HOLIDAY: {
    label: "Holidays",
    icon: "celebration",
    dotClass: "bg-secondary",
    badgeClass: "bg-secondary-container/60 text-on-secondary-fixed-variant",
    accentClass: "",
    iconAccentClass: "text-secondary",
  },
  PLANNED_HOLIDAY: {
    label: "Holidays",
    icon: "celebration",
    dotClass: "bg-secondary",
    badgeClass: "bg-secondary-container/60 text-on-secondary-fixed-variant",
    accentClass: "",
    iconAccentClass: "text-secondary",
  },
};

// The exact 5-category filter set from the Month mockup's dropdown —
// PLANNED_HOLIDAY is what "Holidays" filters (HOLIDAY is system-seeded and
// always shown regardless, same as before). APPOINTMENT is deliberately
// excluded — the mockups' dropdown only ever shows 5 categories, so
// APPOINTMENT events are always shown unfiltered, same as HOLIDAY.
export const CALENDAR_FILTERABLE_CATEGORIES: Extract<
  CalendarEventCategory,
  "CUSTODY" | "MEDICAL" | "SCHOOL" | "ACTIVITY" | "PLANNED_HOLIDAY"
>[] = ["CUSTODY", "MEDICAL", "SCHOOL", "ACTIVITY", "PLANNED_HOLIDAY"];

// Categories never hidden by the filter — always rendered regardless of
// selection state (system holidays + generic appointments, matching how
// the mockups' own filter only ever names 5 of the 6 categories).
export const CALENDAR_ALWAYS_VISIBLE_CATEGORIES: CalendarEventCategory[] = ["HOLIDAY", "APPOINTMENT"];

export const CALENDAR_WRITABLE_CATEGORIES: Exclude<CalendarEventCategory, "HOLIDAY">[] = [
  "CUSTODY",
  "APPOINTMENT",
  "MEDICAL",
  "SCHOOL",
  "ACTIVITY",
  "PLANNED_HOLIDAY",
];
