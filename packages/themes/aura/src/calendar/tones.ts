import type { CategoryTone } from "@kidcom/shared";

// Category tones → classes, as the calendar/today exports draw them:
// sage (Routine chip, first note card), rose (Health), sand (Sport, second
// note card), neutral (plain white card). Event cards keep a white card for
// sage/neutral (the export's "Routine" event), notes use the sage card.

type ToneClasses = { chip: string; eventCard: string; noteCard: string; ink: string };

export const TONES: Record<CategoryTone, ToneClasses> = {
  NEUTRAL: {
    chip: "bg-surface-container-high text-on-surface-variant",
    eventCard: "bg-surface-container-lowest border-outline-variant/30",
    noteCard: "bg-sage-card border-sage-card-border",
    ink: "text-secondary",
  },
  SAGE: {
    chip: "bg-sage-chip text-sage-ink",
    eventCard: "bg-surface-container-lowest border-outline-variant/30",
    noteCard: "bg-sage-card border-sage-card-border",
    ink: "text-sage-ink",
  },
  ROSE: {
    chip: "bg-rose-chip text-rose-ink border border-rose-chip-border",
    eventCard: "bg-rose-card border-rose-card-border",
    noteCard: "bg-rose-card border-rose-card-border",
    ink: "text-rose-ink",
  },
  SAND: {
    chip: "bg-sand-chip text-sand-ink",
    eventCard: "bg-sand-card border-sand-card-border",
    noteCard: "bg-sand-card border-sand-card-border",
    ink: "text-sand-accent",
  },
};

export const toneOf = (tone: CategoryTone | undefined) => TONES[tone ?? "NEUTRAL"];
