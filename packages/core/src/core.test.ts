import { describe, expect, it } from "vitest";

import { isMobileDevice } from "./device/desktopGate";
import { createFormatters } from "./i18n/format";
import { safeNextPath } from "./routing/AppRouter";
import { ROUTES } from "./routing/routes";

describe("safeNextPath", () => {
  it("accepts in-app paths", () => {
    expect(safeNextPath("/calendar?view=week")).toBe("/calendar?view=week");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null])(
    "rejects %s",
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );
});

describe("isMobileDevice", () => {
  const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints }) as Navigator;
  it("detects phones", () => {
    expect(isMobileDevice(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"))).toBe(true);
    expect(isMobileDevice(nav("Mozilla/5.0 (Linux; Android 15; Pixel 7) Mobile"))).toBe(true);
  });
  it("detects iPadOS posing as a Mac", () => {
    expect(isMobileDevice(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5))).toBe(true);
  });
  it("treats desktop browsers as desktop", () => {
    expect(isMobileDevice(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0"))).toBe(false);
    expect(isMobileDevice(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0))).toBe(false);
  });
});

describe("formatters", () => {
  it("always shows Copenhagen wall-clock time", () => {
    // 13:00 UTC on a summer day is 15:00 in Copenhagen (CEST)…
    expect(createFormatters("da-DK").time("2026-07-01T13:00:00Z")).toBe("15.00");
    // …and 14:00 in winter (CET).
    expect(createFormatters("da-DK").time("2026-01-15T13:00:00Z")).toBe("14.00");
  });
});

describe("route table", () => {
  it("has no duplicate paths", () => {
    const paths = ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
  it("never exposes an app-shell screen to signed-out users", () => {
    expect(ROUTES.filter((r) => r.shell === "app" && r.access !== "authed")).toEqual([]);
  });
});
