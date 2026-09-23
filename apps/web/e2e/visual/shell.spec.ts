import { expect, test } from "@playwright/test";

import { compareRegion, cropReference } from "../support/compare";
import { charlie, ida, leo, maya, mockApi } from "../support/mockApi";

// The app shell (header + dock) against docs/design/aura/000_base_scaffold.
// The reference is 585×561 px = 390×374 CSS px at 1.5x. Only the chrome
// bands are compared; the content area differs by design (the reference
// shows a "Headline" placeholder).
const SCAFFOLD = "000_base_scaffold";
const HEADER = { name: "header", x: 0, y: 0, width: 585, height: 120 };
const DOCK = { name: "dock", x: 0, y: 441, width: 585, height: 120 };

// The reference's user photo, cropped from the export itself, so the avatar
// compares like-for-like. (Its child avatars are broken "img" placeholders
// in the export and are masked by the tolerance below.)
const userPhoto = cropReference(SCAFFOLD, { name: "avatar", x: 33, y: 36, width: 48, height: 48 });

test.use({ viewport: { width: 390, height: 374 } });

test("app shell header and dock match 000_base_scaffold", async ({ page }) => {
  await mockApi(page, { me: charlie, children: [leo, maya, ida], media: { "m-charlie": userPhoto } });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const shot = await page.screenshot();
  const header = compareRegion(shot, SCAFFOLD, HEADER);
  const dock = compareRegion(shot, SCAFFOLD, DOCK);
  console.log(`header mismatch ${(header * 100).toFixed(2)}%  dock mismatch ${(dock * 100).toFixed(2)}%`);

  expect(header).toBeLessThan(0.025);
  expect(dock).toBeLessThan(0.015);
});

test("child selector: 1 child shows one avatar, 2 show two, 3+ show two + All", async ({ page }) => {
  for (const [kids, avatars, hasAll] of [
    [[leo], 1, false],
    [[leo, maya], 2, false],
    [[leo, maya, ida], 2, true],
  ] as const) {
    await mockApi(page, { me: charlie, children: [...kids], media: {} });
    await page.goto("/");
    const selector = page.getByRole("group", { name: "Child selector" });
    await expect(selector.getByRole("button", { name: /^Select (?!All)/ })).toHaveCount(avatars);
    await expect(selector.getByRole("button", { name: "Select All" })).toHaveCount(hasAll ? 1 : 0);
    await page.unrouteAll();
  }
});

test("dock marks only the active tab", async ({ page }) => {
  await mockApi(page, { me: charlie, children: [leo, maya], media: {} });
  await page.goto("/calendar");
  const dock = page.getByRole("navigation", { name: "Main navigation" });
  await expect(dock.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
  await expect(dock.locator('[aria-current="page"]')).toHaveCount(1);
});

test("quick action opens a right-hand create sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { me: charlie, children: [leo, maya], media: {} });
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Action" }).click();
  const sidebar = page.getByRole("dialog", { name: "Create" });
  await expect(sidebar).toBeVisible();
  for (const label of ["Appointment", "Message", "Note", "Task", "Moment", "List item", "Swap request"]) {
    await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
  }
  await page.waitForTimeout(600); // let the slide-in finish
  const box = await sidebar.boundingBox();
  expect(box!.x + box!.width).toBeCloseTo(390, 0); // anchored to the right edge
  await page.screenshot({ path: "e2e/.results/quick-action-sidebar.png" });
});
