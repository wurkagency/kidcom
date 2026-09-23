import { describe, expect, it } from "vitest";
import type { PublicUser } from "@kidcom/shared";

import { checkPassword, maskPhone, splitFullName, toE164 } from "./auth/forms";
import { pendingSetupStep } from "./auth/setup";
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
    expect(createFormatters("da-DK", "DK").time("2026-07-01T13:00:00Z")).toBe("15.00");
    // …and 14:00 in winter (CET).
    expect(createFormatters("da-DK", "DK").time("2026-01-15T13:00:00Z")).toBe("14.00");
  });
  it("follows the country, not the UI language", () => {
    const dk = createFormatters("en-US", "DK");
    const us = createFormatters("en-US", "US");
    const day = "2026-09-26T10:05:00Z";
    const numeric = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
    expect(dk.date(day, numeric)).toBe("26.09.2026");
    expect(us.date(day, numeric)).toBe("09/26/2026");
    expect(createFormatters("en-US", "SE").date(day, numeric)).toBe("2026-09-26");
    // Words stay in the UI language, in the country's order.
    expect(dk.date(day)).toBe("26 Sept 2026");
    expect(us.date(day)).toBe("Sep 26, 2026");
    expect(dk.time(day)).toBe("12.05");
    expect(us.time(day)).toBe("12:05 PM");
    expect(dk.number(1234567.5)).toBe("1.234.567,5");
    expect(us.number(1234567.5)).toBe("1,234,567.5");
    expect(createFormatters("en-US", "NO").number(1234.5)).toBe("1 234,5");
    expect(dk.percent(0.6)).toBe("60 %");
    expect(us.percent(0.6)).toBe("60%");
    expect(dk.weekStart).toBe(1);
    expect(us.weekStart).toBe(7);
  });
});

describe("regions", () => {
  it("resolves account, then device, then Denmark", async () => {
    const { detectRegion, resolveRegion } = await import("./i18n/region");
    expect(detectRegion(["en", "en-GB", "da-DK"])).toBe("GB");
    expect(detectRegion(["en", "da"])).toBeNull();
    expect(resolveRegion("NO", "GB")).toBe("NO");
    expect(resolveRegion(null, "GB")).toBe("GB");
    expect(resolveRegion("XX", null)).toBe("DK");
  });
  it("reads numbers typed either way", async () => {
    const { parseDecimal } = await import("./i18n/region");
    expect(parseDecimal("48,5")).toBe(48.5);
    expect(parseDecimal("48.5")).toBe(48.5);
    expect(parseDecimal("3,250")).toBe(3.25);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("1,234.5")).toBe(1234.5);
    expect(parseDecimal("1 234,5")).toBe(1234.5);
    expect(parseDecimal("1.234.567")).toBe(1234567);
    expect(parseDecimal("148")).toBe(148);
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal(",")).toBeNaN();
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

describe("account form helpers", () => {
  it("builds E.164 numbers from what people actually type", () => {
    expect(toE164("45", "20 12 34 56")).toBe("+4520123456");
    expect(toE164("47", "0406 12 345")).toBe("+4740612345");
    expect(toE164("45", "+46 70 123 45 67")).toBe("+46701234567");
    expect(toE164("45", "0045 20123456")).toBe("+4520123456");
    expect(toE164("45", "123")).toBeNull();
  });
  it("masks all but the last two digits", () => {
    expect(maskPhone("+4520123456")).toBe("+45 ••••••56");
    expect(maskPhone("+358401234567")).toBe("+358 •••••••67");
  });
  it("mirrors the server's password rules", () => {
    expect(checkPassword("short1").valid).toBe(false);
    expect(checkPassword("longwithoutdigits").valid).toBe(false);
    expect(checkPassword("calm-harbour").valid).toBe(true);
    expect(checkPassword("").strength).toBe(0);
    expect(checkPassword("abc").strength).toBe(1);
    expect(checkPassword("Calm-Harbour-7").strength).toBe(3);
  });
  it("splits a full name", () => {
    expect(splitFullName("  Sarah   Jenkins Berg ")).toEqual({ firstName: "Sarah", lastName: "Jenkins Berg" });
    expect(splitFullName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
  });
});

describe("account setup order", () => {
  const user = (over: Partial<PublicUser>): PublicUser => ({
    id: "u", email: "e@x.dk", firstName: "A", lastName: "B", avatarUrl: null,
    emailVerifiedAt: "2026-01-01", phone: "+4520123456", phoneVerifiedAt: "2026-01-01", pendingPhone: null,
    hasPassword: true, oauthProviders: [], themeId: null, locale: null, region: null, ...over,
  });
  it("phone, then password (email signups only), then email", () => {
    expect(pendingSetupStep(user({ phoneVerifiedAt: null, hasPassword: false, emailVerifiedAt: null }))).toBe("phone");
    expect(pendingSetupStep(user({ hasPassword: false, emailVerifiedAt: null }))).toBe("password");
    expect(pendingSetupStep(user({ hasPassword: false, oauthProviders: ["google"], emailVerifiedAt: null }))).toBe("email");
    expect(pendingSetupStep(user({}))).toBeNull();
  });
});

describe("calendar dates", () => {
  it("does Monday-first week math", async () => {
    const { isoWeekday, startOfWeek, weekDays, isoWeek } = await import("./calendar/dates");
    expect(isoWeekday("2026-09-20")).toBe(7); // Sunday
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14");
    expect(weekDays("2026-09-23")[0]).toBe("2026-09-21");
    expect(isoWeek("2026-09-23")).toBe(39); // the Stitch mock's "Week 39"
    expect(isoWeek("2027-01-01")).toBe(53);
  });
  it("starts weeks on the country's first day", async () => {
    const { startOfWeek, weekDays, monthGrid } = await import("./calendar/dates");
    expect(startOfWeek("2026-09-23", 7)).toBe("2026-09-20"); // Sunday-first (US)
    expect(startOfWeek("2026-09-20", 7)).toBe("2026-09-20");
    expect(weekDays("2026-09-26", 7).at(-1)).toBe("2026-09-26"); // …ends on Saturday
    const sept = monthGrid("2026-09-15", 7);
    expect(sept[0]).toBe("2026-08-30");
    expect(sept.length % 7).toBe(0);
  });
  it("builds whole-week month grids", async () => {
    const { monthGrid, addMonths } = await import("./calendar/dates");
    const sept = monthGrid("2026-09-15");
    expect(sept[0]).toBe("2026-08-31");
    expect(sept.length % 7).toBe(0);
    expect(sept.at(-1)).toBe("2026-10-04");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });
  it("uses Copenhagen days and times", async () => {
    const { dateKey, timeKey } = await import("./calendar/dates");
    expect(dateKey("2026-07-01T22:30:00Z")).toBe("2026-07-02"); // 00:30 CEST
    expect(timeKey("2026-01-15T13:00:00Z")).toBe("14:00");
  });
  it("converts Copenhagen wall-clock times to instants, across DST", async () => {
    const { copenhagenInstant } = await import("./calendar/dates");
    expect(copenhagenInstant("2026-01-15", "14:00")).toBe("2026-01-15T13:00:00.000Z");
    expect(copenhagenInstant("2026-07-01", "08:30")).toBe("2026-07-01T06:30:00.000Z");
    expect(copenhagenInstant("2026-03-29", "12:00")).toBe("2026-03-29T10:00:00.000Z"); // DST start day
    expect(copenhagenInstant("2026-10-25", "00:00")).toBe("2026-10-24T22:00:00.000Z"); // DST end day
  });
});
