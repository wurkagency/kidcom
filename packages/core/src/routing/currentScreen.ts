import { createContext, useContext } from "react";
import type { ScreenId } from "@kinnd/theme-kit";

// Which screen id is rendering. Lets a shell mark the active dock tab, and
// lets one screen component serving several routes (the calendar views)
// know which one it is.
export const CurrentScreenContext = createContext<ScreenId | null>(null);

export function useCurrentScreen(): ScreenId {
  const screen = useContext(CurrentScreenContext);
  if (!screen) throw new Error("useCurrentScreen used outside a routed screen");
  return screen;
}
