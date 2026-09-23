import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps an Aura type size alongside a text color", () => {
    expect(cn("font-semibold text-foreground", "font-headline-md text-headline-md text-on-surface")).toContain(
      "text-headline-md",
    );
  });
  it("still resolves conflicting sizes and colors", () => {
    expect(cn("text-body-md text-secondary", "text-label-sm text-on-surface")).toBe("text-label-sm text-on-surface");
  });
  it("merges named spacing", () => {
    expect(cn("px-4", "px-margin")).toBe("px-margin");
  });
});
