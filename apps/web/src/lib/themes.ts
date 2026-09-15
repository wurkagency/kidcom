export type SkinId = "greenkeeper";

export type SkinDefinition = {
  id: SkinId;
  name: string;
};

// Each skin's CSS variables live in index.css under `[data-skin="<id>"]`
// (Greenkeeper's values are the :root defaults). Add a new skin by adding
// its id/name here and its variable overrides there.
export const SKINS: SkinDefinition[] = [{ id: "greenkeeper", name: "Greenkeeper" }];

export const DEFAULT_SKIN: SkinId = "greenkeeper";

export function isSkinId(value: string): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}

export function applySkin(id: SkinId) {
  document.documentElement.dataset.skin = id;
}
