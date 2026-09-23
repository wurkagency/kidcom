import { expect, test, type Page, type Request } from "@playwright/test";
import { PNG } from "pngjs";

import { categories, members } from "../support/calendarFixture";
import { charlie, leo, maya, mockApi } from "../support/mockApi";
import { comments, feed, FIXTURE_NOW, gallery, homeRun } from "../support/momentsFixture";

// Phase 4 flows against the mocked API: what each screen sends. The API's
// own rules (visibility, bookmarks, archives) are covered by
// apps/api/src/routes/phase4.test.ts.

const grey = () => {
  const png = new PNG({ width: 4, height: 3 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([204, 204, 204, 255], i);
  return PNG.sync.write(png);
};

async function boot(page: Page, routes: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: charlie,
    children: [leo, maya],
    media: Object.fromEntries([...gallery.map((g) => g.id), "p-1", "p-2", "p-3", "p-4", "p-5", "p-6"].map((id) => [id, grey()])),
    routes: {
      "GET /categories": { categories },
      "GET /children/c-leo/family": { members },
      "GET /children/c-maya/family": { members },
      "GET /moments": { items: feed, nextCursor: null },
      "GET /moments/media": { items: gallery },
      "GET /children/c-leo/moments/m-homerun": homeRun,
      "GET /children/c-leo/moments/m-homerun/comments": { items: comments },
      ...routes,
    },
  });
}

const nextRequest = (page: Page, method: string, path: string) =>
  page.waitForRequest((r: Request) => r.method() === method && new URL(r.url()).pathname.endsWith(path));

test("create a moment: uploads, headline, children, category, place, parents only, notify", async ({ page }) => {
  await boot(page, {
    "POST /media/upload": { id: "up-1", type: "IMAGE", status: "PROCESSING", width: null, height: null, durationSeconds: null },
    "POST /children/c-leo/moments": { ...homeRun, id: "m-new" },
  });
  await page.goto("/moments/new");
  await page.locator('input[type="file"]').setInputFiles({ name: "walk.png", mimeType: "image/png", buffer: grey() });
  await expect(page.getByText("Selected Files (1/6)")).toBeVisible();
  await page.getByLabel("headline").fill("Spring Walk in Dyrehaven");
  await page.getByLabel("Story").fill("Deer and acorns.");
  await page.getByRole("button", { name: /^Select All$/ }).click();
  await page.getByRole("button", { name: /Choose a category/ }).click();
  await page.getByRole("menuitem", { name: "Outdoor" }).click();
  await page.getByPlaceholder("Where was it?").fill("Klampenborg, Denmark");
  await page.getByRole("switch").first().click(); // visible to family → off
  await page.getByRole("switch").nth(1).click(); // notify → on
  const sent = nextRequest(page, "POST", "/children/c-leo/moments");
  await page.getByRole("button", { name: "Publish to Moments" }).click();
  expect((await sent).postDataJSON()).toEqual({
    title: "Spring Walk in Dyrehaven",
    text: "Deer and acorns.",
    categoryId: "cat_outdoor",
    location: "Klampenborg, Denmark",
    occurredOn: "2026-10-12",
    familyVisible: false,
    childIds: ["c-leo", "c-maya"],
    notify: true,
    mediaAssetIds: ["up-1"],
  });
  await expect(page).toHaveURL(/\/children\/c-leo\/moments\/m-new$/);
});

test("love, bookmark and comment", async ({ page }) => {
  await boot(page, {
    "POST /children/c-leo/moments/m-homerun/reactions": { reactedByMe: true, reactionCount: 5 },
    "POST /bookmarks": null,
    "POST /children/c-leo/moments/m-homerun/comments": { id: "cm-new", authorId: "u-charlie", authorName: "Charlie Nielsen", authorAvatarUrl: null, text: "So proud!", createdAt: FIXTURE_NOW.toISOString() },
  });
  await page.goto("/moments");
  const card = page.locator("article").first();
  const loved = nextRequest(page, "POST", "/m-homerun/reactions");
  await card.getByRole("button", { name: "Love" }).click();
  await loved;
  await expect(card.getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");

  const saved = nextRequest(page, "POST", "/bookmarks");
  await card.getByRole("button", { name: "Bookmark" }).click();
  expect((await saved).postDataJSON()).toEqual({ momentId: "m-homerun" });

  await card.getByRole("link", { name: "Comments" }).click();
  await page.getByLabel("Write a warm comment...").fill("So proud!");
  const commented = nextRequest(page, "POST", "/m-homerun/comments");
  await page.getByRole("button", { name: "Send" }).click();
  expect((await commented).postDataJSON()).toEqual({ text: "So proud!" });
  await expect(page.getByText("So proud!")).toBeVisible();
});

test("gallery: long-press selects, then Download sends the chosen files to the device or by email", async ({ page }) => {
  await boot(page, { "POST /media/archive/email": null });
  await page.goto("/media");
  const tiles = page.getByRole("button", { name: /^Photo from/ });
  const first = tiles.first();
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.getByText("1 item selected")).toBeVisible(); // the release didn't undo it
  await tiles.nth(1).click();
  await expect(page.getByText("2 items selected")).toBeVisible();
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page).toHaveURL(/\/media\/download\?ids=d-1,d-2$/);

  await page.getByText("Optimized", { exact: true }).click();
  await page.getByText("Email", { exact: true }).click();
  const emailed = nextRequest(page, "POST", "/media/archive/email");
  await page.getByRole("button", { name: /Email me a link/ }).click();
  expect((await emailed).postDataJSON()).toEqual({ mediaIds: ["d-1", "d-2"], variant: "optimized" });

  await page.getByText("Device", { exact: true }).click();
  const zip = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/media/archive");
  await page.getByRole("button", { name: /Download selected media/ }).click();
  const url = new URL((await zip).url());
  expect(url.searchParams.get("ids")).toBe("d-1,d-2");
  expect(url.searchParams.get("variant")).toBe("optimized");
});
