// Per-user visual skin catalogue (v2.0 theming). Shared between apps/api
// (validates PATCH /auth/me's skinId) and apps/web (applies it) so both
// sides agree on the same fixed, pre-built set — no end-user authoring.
export type SkinId = "greenkeeper" | "sky" | "architecture";

export type SkinDefinition = {
  id: SkinId;
  name: string;
};

// Each skin's CSS variables live in apps/web/src/index.css under
// `[data-skin="<id>"]` (Greenkeeper's values are the :root defaults). Add a
// new skin by adding its id/name here and its variable overrides there.
export const SKINS: SkinDefinition[] = [
  { id: "greenkeeper", name: "Greenkeeper" },
  { id: "sky", name: "Sky" },
  // The first skin built on shadcn/ui components (apps/web/src/components/
  // Card.tsx, Toggle.tsx, SegmentedControl.tsx, FormInput.tsx, Banner.tsx,
  // Avatar.tsx, AssignSheet.tsx) rather than this app's hand-rolled ones —
  // see docs/Themes/Spring Morning/DESIGN.md for the source design system.
  { id: "architecture", name: "Quiet Architecture" },
];

export const DEFAULT_SKIN: SkinId = "greenkeeper";

export function isSkinId(value: string): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}
