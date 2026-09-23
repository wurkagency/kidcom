import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { categories, members } from "../support/calendarFixture";
import { comparePage, loadReference, referencePng } from "../support/compare";
import { charlie, ida, leo, maya, mockApi } from "../support/mockApi";
import { comments, feed, FIXTURE_NOW, gallery, homeRun, videoInfo } from "../support/momentsFixture";

// Moments + media screens vs docs/design/aura. The exports' photos are
// broken "img" placeholders rendered as flat grey, so fixture photos are
// flat grey too; thresholds sit just above the measured values.

function grey(width = 8, height = 6): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([204, 204, 204, 255], i);
  return PNG.sync.write(png);
}

const photoIds = ["p-1", "p-2", "p-3", "p-4", "p-5", "p-6", "d-1", "d-2", "d-3", "d-4", "d-5", "d-6", "v-1"];

async function open(page: Page, folder: string, path: string) {
  const ref = loadReference(folder);
  await page.setViewportSize({ width: ref.width / 1.5, height: Math.round(ref.height / 1.5) });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: charlie,
    children: [leo, maya, ida],
    media: { ...Object.fromEntries(photoIds.map((id) => [id, grey()])), "v-1": grey(16, 9) },
    routes: {
      "GET /categories": { categories },
      "GET /children/c-leo/family": { members },
      "GET /moments": { items: feed, nextCursor: null },
      "GET /moments/media": { items: gallery },
      "GET /children/c-leo/moments/m-homerun": homeRun,
      "GET /children/c-leo/moments/m-homerun/comments": { items: comments },
      "GET /media/v-1/info": videoInfo,
    },
  });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function check(page: Page, folder: string, limit: number) {
  const shot = await page.screenshot({ fullPage: true });
  await page.screenshot({ path: `e2e/.results/${folder}.png`, fullPage: true });
  const { mismatch, heightDelta } = comparePage(shot, referencePng(folder), folder);
  console.log(`${folder}: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(limit);
}

test("moments feed matches kidcom_moments_feed_1", async ({ page }) => {
  await open(page, "kidcom_moments_feed_1", "/moments");
  await expect(page.getByRole("link", { name: "First Home Run at Little League!" })).toBeVisible();
  await expect(page.getByText("Today, 02:20 PM")).toBeVisible();
  await check(page, "kidcom_moments_feed_1", 0.025);
});

test("moment post matches kidcom_moments_feed_2", async ({ page }) => {
  await open(page, "kidcom_moments_feed_2", "/children/c-leo/moments/m-homerun");
  await expect(page.getByText("Oakwood Little League Field, Pasadena")).toBeVisible();
  await expect(page.getByText("Grandma Inger")).toBeVisible();
  await check(page, "kidcom_moments_feed_2", 0.045);
});

test("download matches kidcom_download_preview", async ({ page }) => {
  await open(page, "kidcom_download_preview", `/media/download?ids=${gallery.map((g) => g.id).join(",")}`);
  await expect(page.getByRole("button", { name: /Download selected media/ })).toBeVisible();
  await check(page, "kidcom_download_preview", 0.12);
});

test("video viewer with details matches kidcom_media_viewer_player", async ({ page }) => {
  await open(page, "kidcom_media_viewer_player", "/media/v-1");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Details" }).click();
  await expect(page.getByText("H.265 (HEVC)")).toBeVisible();
  await expect(page.getByText("UHD • 3840 x 2160")).toBeVisible();
  await page.waitForTimeout(500);
  await check(page, "kidcom_media_viewer_player", 0.16);
});
