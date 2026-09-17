export type { SkinId, SkinDefinition } from "@kidcom/shared";
export { SKINS, DEFAULT_SKIN, isSkinId } from "@kidcom/shared";

import type { SkinId } from "@kidcom/shared";

export function applySkin(id: SkinId) {
  document.documentElement.dataset.skin = id;
}
