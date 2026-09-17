import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SkinId } from "@kidcom/shared";

import { useAuth } from "./AuthContext";
import { getSkin, setSkin as persistSkin } from "./preferences";

type SkinState = {
  skin: SkinId;
  setSkin: (value: SkinId) => Promise<void>;
};

const SkinContext = createContext<SkinState | null>(null);

// Reactive wrapper around the imperative getSkin/setSkin/applySkin trio in
// lib/preferences.ts and lib/themes.ts (kept as-is — main.tsx still needs
// the synchronous pre-render applySkin(getSkin()) call for an instant first
// paint, before React or this provider exist). This just gives components a
// way to read/react to the current skin without polling
// document.documentElement.dataset.skin by hand.
export function SkinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [skin, setSkinState] = useState<SkinId>(() => getSkin());

  // AuthContext's reconcileSkinFromServer() writes the server-resolved skin
  // to localStorage synchronously before `user` updates, so re-reading here
  // whenever `user` changes picks that resolution up.
  useEffect(() => {
    setSkinState(getSkin());
  }, [user]);

  async function setSkin(value: SkinId) {
    await persistSkin(value);
    setSkinState(getSkin());
  }

  return <SkinContext.Provider value={{ skin, setSkin }}>{children}</SkinContext.Provider>;
}

export function useSkin() {
  const ctx = useContext(SkinContext);
  if (!ctx) {
    throw new Error("useSkin must be used within a SkinProvider");
  }
  return ctx;
}
