import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { comparePage, loadReference, referencePng } from "../support/compare";
import { charlie, mockApi } from "../support/mockApi";
import { augustDetail, contacts, custody, FIXTURE_NOW, growth, listItems, schedule, stenbeckFamily, stenbecks } from "../support/childrenFixture";

// Lists + Children + Child profile screens vs docs/design/aura. Photos are
// flat grey (the exports' portraits can't be reproduced); thresholds sit
// just above the measured values.

function grey(width = 8, height = 8): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([190, 190, 190, 255], i);
  return PNG.sync.write(png);
}

const mediaIds = [...stenbecks.map((c) => `a-${c.id}`), ...stenbeckFamily.map((m) => `a-${m.userId}`), "cover-august"];

export async function openChildren(page: Page, folder: string, path: string) {
  const ref = loadReference(folder);
  await page.setViewportSize({ width: ref.width / 1.5, height: Math.round(ref.height / 1.5) });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: { ...charlie, avatarUrl: "a-u-charlie" },
    children: stenbecks,
    media: Object.fromEntries(mediaIds.map((id) => [id, grey(id.startsWith("cover") ? 16 : 8, 8)])),
    routes: {
      "GET /lists": { items: listItems },
      "GET /children/c-august": augustDetail,
      "GET /children/c-august/family": { members: stenbeckFamily },
      "GET /children/c-august/custody-plan": custody,
      "GET /children/c-august/growth-entries": { items: growth },
      "GET /children/c-august/emergency-contacts": { items: contacts },
      "GET /children/c-august/medical-info": { items: [] },
      "GET /children/c-august/schedule": { items: schedule, completedCount: 12, totalCount: 20 },
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

test("lists matches kinnd_lists", async ({ page }) => {
  await openChildren(page, "kinnd_lists", "/lists");
  await expect(page.getByText("3 of 5 necessities claimed")).toBeVisible();
  await expect(page.getByText("Inger is providing this")).toBeVisible();
  await check(page, "kinnd_lists", 0.1);
});

test("children matches kinnd_children", async ({ page }) => {
  await openChildren(page, "kinnd_children", "/children");
  await expect(page.getByText("3 children selected")).toBeVisible();
  await expect(page.getByText("Read-only permissions")).toBeVisible();
  await check(page, "kinnd_children", 0.085);
});

test("child profile matches kinnd_child_profile_1", async ({ page }) => {
  await openChildren(page, "kinnd_child_profile_1", "/children/c-august");
  await expect(page.getByRole("heading", { name: "August Stenbeck" })).toBeVisible();
  await expect(page.getByText("Anna • Charlie").first()).toBeVisible();
  // Most of the gap is the cover: a full-bleed red photo in the export, flat grey here.
  await check(page, "kinnd_child_profile_1", 0.21);
});

test("health timeline matches kinnd_child_profile_2", async ({ page }) => {
  await openChildren(page, "kinnd_child_profile_2", "/children/c-august/health");
  await expect(page.getByText("8 upcoming")).toBeVisible();
  await expect(page.getByText("12 completed")).toBeVisible();
  await check(page, "kinnd_child_profile_2", 0.085);
});
