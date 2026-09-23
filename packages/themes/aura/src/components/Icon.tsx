import type { HTMLAttributes } from "react";

import { cn } from "../lib/utils";

type IconProps = HTMLAttributes<HTMLSpanElement> & {
  /** Material Symbols Outlined ligature name, e.g. "calendar_today". */
  name: string;
  /** Filled variant (FILL 1) — Stitch uses it for active/selected glyphs. */
  filled?: boolean;
};

/**
 * Aura's only icon set: Material Symbols Outlined (self-hosted). Size and
 * color come from className (text-[18px], text-secondary), exactly as in the
 * Stitch exports. Decorative by default; pass aria-label to make it
 * meaningful on its own.
 */
export function Icon({ name, filled, className, ...props }: IconProps) {
  return (
    <span
      aria-hidden={props["aria-label"] ? undefined : true}
      translate="no"
      {...props}
      className={cn("material-symbols-outlined shrink-0 select-none leading-none", filled && "icon-fill", className)}
    >
      {name}
    </span>
  );
}
