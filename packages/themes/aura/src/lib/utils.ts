import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default scales. Without this, Aura's
// type tokens (text-headline-md, …) are mistaken for text *colors* and
// silently dropped when merged with a color like text-on-surface.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "headline-lg",
        "headline-lg-mobile",
        "headline-md",
        "headline-sm",
        "title-md",
        "body-lg",
        "body-md",
        "label-md",
        "label-sm",
        "micro-meta",
      ],
      spacing: ["gutter", "margin", "space-xs", "space-sm", "space-md", "space-lg", "space-xl"],
      shadow: ["float", "dock", "segment"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
