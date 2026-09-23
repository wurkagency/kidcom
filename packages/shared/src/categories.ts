// The global category set shared by Calendar, Moments and Media. System
// categories are fixed here (their names are translated in the app via
// `categories.<key>`); users add their own on top. apps/api ensures these
// rows exist at startup (lib/categories.ts) and the v3.0 migration seeded
// the same list, so the two must stay in step: change a key = migration.

// The four tones the Aura design uses for category chips and cards.
export const CATEGORY_TONES = ["NEUTRAL", "SAGE", "ROSE", "SAND"] as const;
export type CategoryTone = (typeof CATEGORY_TONES)[number];

export type SystemCategory = {
  key: string;
  /** Material Symbols name */
  icon: string;
  tone: CategoryTone;
  /** Where the category is offered first (all categories are usable everywhere). */
  usage: readonly ("calendar" | "moments")[];
};

export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  { key: "routine", icon: "repeat", tone: "SAGE", usage: ["calendar"] },
  { key: "appointment", icon: "event", tone: "NEUTRAL", usage: ["calendar"] },
  { key: "health", icon: "health_and_safety", tone: "ROSE", usage: ["calendar", "moments"] },
  { key: "school", icon: "school", tone: "SAGE", usage: ["calendar", "moments"] },
  { key: "sport", icon: "sports_soccer", tone: "SAND", usage: ["calendar", "moments"] },
  { key: "playdate", icon: "toys", tone: "SAND", usage: ["calendar"] },
  { key: "vacation", icon: "beach_access", tone: "SAND", usage: ["calendar", "moments"] },
  { key: "holiday", icon: "flag", tone: "NEUTRAL", usage: ["calendar"] },
  { key: "milestone", icon: "star", tone: "SAGE", usage: ["moments"] },
  { key: "outdoor", icon: "park", tone: "SAGE", usage: ["moments"] },
  { key: "creative", icon: "palette", tone: "SAND", usage: ["moments"] },
];

/** Stable database id of a system category. */
export const systemCategoryId = (key: string) => `cat_${key}`;

export function isCategoryTone(value: unknown): value is CategoryTone {
  return typeof value === "string" && (CATEGORY_TONES as readonly string[]).includes(value);
}
