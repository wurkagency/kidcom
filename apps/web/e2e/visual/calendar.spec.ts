import { expect, test, type Page } from "@playwright/test";

import { categories, FIXTURE_NOW, inboundSwap, leoOverview, overview } from "../support/calendarFixture";
import { comparePage, loadReference, referencePng } from "../support/compare";
import { charlie, ida, leo, maya, mockApi } from "../support/mockApi";

// Today + calendar views vs docs/design/aura, with the export's sample
// content (support/calendarFixture.ts) and Leo selected in the header.
// Thresholds sit just above the measured values so regressions fail. The
// family is in Copenhagen, so formats follow Denmark (Monday-first weeks,
// as the exports draw them).

async function open(page: Page, folder: string, path: string, swaps = false) {
  const ref = loadReference(folder);
  await page.setViewportSize({ width: ref.width / 1.5, height: Math.round(ref.height / 1.5) });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await page.addInitScript(() => localStorage.setItem("kidcom.childFilter.u-charlie", "c-leo"));
  await mockApi(page, {
    me: { ...charlie, region: "DK" },
    children: [leo, maya, ida],
    media: {},
    routes: {
      "GET /overview": overview(leoOverview({ swaps: swaps ? [inboundSwap] : [] })),
      "GET /categories": { categories },
    },
  });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function check(page: Page, folder: string, limit: number) {
  const shot = await page.screenshot({ fullPage: true });
  await page.screenshot({ path: `e2e/.results/${folder}.png`, fullPage: true });
  const { mismatch, heightDelta } = comparePage(shot, referencePng(folder), folder);
  console.log(`${folder}: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(limit);
}

test("today matches kidcom_today_screen_updated_note", async ({ page }) => {
  await open(page, "kidcom_today_screen_updated_note", "/");
  await expect(page.getByRole("heading", { name: "Hi Charlie," })).toBeVisible();
  await expect(page.getByText("3 of 4 items packed")).toBeVisible();
  await expect(page.getByText("Handled by Dad")).toBeVisible();
  await check(page, "kidcom_today_screen_updated_note", 0.04);
});

test("agenda matches kidcom_calendar_3", async ({ page }) => {
  await open(page, "kidcom_calendar_3", "/calendar");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("4 remaining")).toBeVisible();
  await check(page, "kidcom_calendar_3", 0.035);
});

test("week matches kidcom_calendar_2", async ({ page }) => {
  await open(page, "kidcom_calendar_2", "/calendar/week", true);
  await expect(page.getByText("Week 42")).toBeVisible();
  await check(page, "kidcom_calendar_2", 0.05);
});

test("month matches kidcom_calendar_1", async ({ page }) => {
  await open(page, "kidcom_calendar_1", "/calendar/month", true);
  await expect(page.getByText("Approve for 7 June")).toBeVisible();
  await check(page, "kidcom_calendar_1", 0.05);
});
