import type { ThemeRegistry } from "@kinnd/theme-kit";

// Installed themes. Each is its own lazily loaded chunk (code + CSS), so a
// user only downloads the theme they use. Adding a theme = a package under
// packages/themes/<id>, its id in packages/shared THEME_IDS, and a line here.
export const themeRegistry: ThemeRegistry = {
  aura: () => import("@kinnd/theme-aura"),
};
