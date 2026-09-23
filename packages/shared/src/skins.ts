// Single visual skin (v3.0 — consolidated to Aura only, 2026-09-22). Shared
// between apps/api (validates PATCH /auth/me's skinId) and apps/web (applies
// it) so both sides agree. Greenkeeper, Sky, and Quiet Architecture were
// retired and their tokens removed from apps/web/src/index.css — "aura" is
// now the only valid value.
export type SkinId = "aura";

export type SkinDefinition = {
  id: SkinId;
  name: string;
};

// Aura's CSS variables live in apps/web/src/index.css's :root block (the
// single theme of truth — no more `[data-skin="<id>"]` overrides).
export const SKINS: SkinDefinition[] = [{ id: "aura", name: "Aura" }];

export const DEFAULT_SKIN: SkinId = "aura";

export function isSkinId(value: string): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}
