import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// This project's tailwind.config.ts adds custom fontSize keys (`text-body-md`,
// `text-label-md`, etc.) alongside Tailwind's own text-{xs,sm,base,...} scale.
// tailwind-merge's default config only recognizes the stock keyword list when
// deciding whether a `text-*` class is a font-size or a text-color utility —
// without this, e.g. shadcn's `text-base` and this project's `text-body-md`
// get miscategorized as two different groups and both survive a cn() merge
// instead of the later one winning, silently breaking any override of a
// shadcn/ui component's default type styling.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display-lg",
        "text-headline-lg",
        "text-headline-lg-mobile",
        "text-headline-md",
        "text-body-lg",
        "text-body-md",
        "text-label-md",
        "text-label-sm",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
