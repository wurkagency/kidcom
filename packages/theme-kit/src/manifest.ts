import type { ComponentType, LazyExoticComponent, ReactNode } from "react";
import { z } from "zod";
import { THEME_IDS, type ThemeId } from "@kidcom/shared";

import { SCREEN_IDS, SHELL_KINDS, type ScreenId, type ShellKind } from "./screens";

export type ShellProps = {
  screen: ScreenId;
  children: ReactNode;
};

export type ScreenComponent = ComponentType | LazyExoticComponent<ComponentType>;

export type ThemeManifest = {
  id: ThemeId;
  /** Display name for the theme picker (not translated — it's a brand name). */
  name: string;
  /** Browser chrome / PWA colors while this theme is active. */
  meta: { themeColor: string; backgroundColor: string };
  shells: Record<ShellKind, ComponentType<ShellProps>>;
  screens: Record<ScreenId, ScreenComponent>;
  /** Rendered while a lazy screen or data guard is resolving. */
  Loading: ComponentType;
  /** Rendered when a screen throws. */
  ErrorFallback: ComponentType<{ error: unknown; reset: () => void }>;
};

const componentLike = z.custom<ComponentType>(
  (value) => typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value),
  { message: "expected a React component" },
);

const manifestSchema = z.object({
  id: z.enum(THEME_IDS),
  name: z.string().min(1),
  meta: z.object({
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  shells: z.object(Object.fromEntries(SHELL_KINDS.map((k) => [k, componentLike])) as Record<ShellKind, typeof componentLike>).strict(),
  screens: z.object(Object.fromEntries(SCREEN_IDS.map((id) => [id, componentLike])) as Record<ScreenId, typeof componentLike>).strict(),
  Loading: componentLike,
  ErrorFallback: componentLike,
});

/**
 * Declares a theme. Validates at load time that the theme implements every
 * shell and every screen id — a theme can never ship with a route that
 * renders nothing.
 */
export function defineTheme(manifest: ThemeManifest): ThemeManifest {
  const result = manifestSchema.safeParse(manifest);
  if (!result.success) {
    throw new Error(`Invalid theme manifest "${String(manifest?.id)}":\n${z.prettifyError(result.error)}`);
  }
  return manifest;
}
