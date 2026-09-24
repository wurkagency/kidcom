import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { SECURITY_HEADERS } from "../../security-headers";

import { categories, FIXTURE_NOW, inboundSwap, leoOverview, members, overview } from "../support/calendarFixture";
import { augustDetail, contacts, custody, growth, listItems, schedule, stenbeckFamily, stenbecks } from "../support/childrenFixture";
import { ingerMessages, ingerThread, notifications, threads } from "../support/messagesFixture";
import { comments, feed, gallery, homeRun, videoInfo } from "../support/momentsFixture";
import { charlie, mockApi } from "../support/mockApi";

// The production build, served with the production security headers
// (security-headers.ts, via vite preview — playwright.production.config.ts),
// must run without a single Content-Security-Policy violation: every main
// screen, plus the features that need a CSP exception (injected styles,
// blob: previews, video, the service worker). A new dependency that needs
// eval or an outside origin fails here, not in production.
//   npm run test:csp --workspace=apps/web

function grey(width = 8, height = 6): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([204, 204, 204, 255], i);
  return PNG.sync.write(png);
}

async function setup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ← ${e.blockedURI || "inline"}`),
    );
  });
  const media = Object.fromEntries(["p-1", "p-2", "p-3", "p-4", "p-5", "p-6", "d-1", "d-2", "d-3", "d-4", "d-5", "d-6", "v-1"].map((id) => [id, grey()]));
  await mockApi(page, {
    me: { ...charlie, region: "DK" },
    children: [...stenbecks, { ...stenbecks[0]!, id: "c-leo", firstName: "Leo" }],
    media,
    routes: {
      "GET /overview": overview(leoOverview({ swaps: [inboundSwap] })),
      "GET /categories": { categories },
      "GET /children/c-leo/family": { members },
      "GET /moments": { items: feed, nextCursor: null },
      "GET /moments/media": { items: gallery },
      "GET /children/c-leo/moments/m-homerun": homeRun,
      "GET /children/c-leo/moments/m-homerun/comments": { items: comments },
      "GET /media/v-1/info": videoInfo,
      "GET /lists": { items: listItems },
      "GET /children/c-august": augustDetail,
      "GET /children/c-august/family": { members: stenbeckFamily },
      "GET /children/c-august/custody-plan": custody,
      "GET /children/c-august/growth-entries": { items: growth },
      "GET /children/c-august/emergency-contacts": { items: contacts },
      "GET /children/c-august/schedule": { items: schedule, completedCount: 12, totalCount: 20 },
      "GET /messages/threads": { items: threads },
      "GET /messages/threads/t-inger": ingerThread,
      "GET /messages/threads/t-inger/messages": { items: ingerMessages, hasMore: false },
      "GET /notifications": { items: notifications, unreadCount: 1, nextCursor: null },
      "GET /billing/status": { tier: "FREE", status: "ACTIVE", billingPeriod: null, trialEndsAt: null, currentPeriodEnd: null, trialExpired: false },
      "GET /billing/plans": { currency: "DKK", vatRate: 0.25, plans: [{ tier: "PARENTS", prices: { MONTHLY: 2900, ANNUAL: 27500 } }, { tier: "FAMILY", prices: { MONTHLY: 5900, ANNUAL: 55900 } }] },
      "GET /auth/sessions": { otherSessions: 1 },
    },
  });
  const refused: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && refused.push(m.text().slice(0, 200)));
  return refused;
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

const SCREENS = [
  "/", "/calendar", "/calendar/month", "/moments", "/children/c-leo/moments/m-homerun", "/media", "/lists", "/children",
  "/children/c-august", "/children/c-august/health", "/messages", "/messages/t-inger", "/notifications", "/search",
  "/profile", "/profile/account", "/billing", "/billing/checkout", "/preferences", "/preferences/security",
];

test("every main screen runs under the production CSP", async ({ page }) => {
  const refused = await setup(page);
  const res = await page.goto("/");
  expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  for (const path of SCREENS) {
    await page.goto(path);
    await page.locator("main h1, main h2").first().waitFor();
    await page.waitForTimeout(250);
    expect(await violations(page), path).toEqual([]);
  }
  expect(refused).toEqual([]);
});

test("dialogs, photo previews, video and the service worker run under the CSP", async ({ page }) => {
  const refused = await setup(page);

  // Radix dialog (scroll-lock injects a <style>) + toasts' injected styles.
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Action" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Photo preview before upload: a blob: image.
  await page.goto("/moments/new");
  const chooser = page.waitForEvent("filechooser");
  await page.locator("input[type=file]").first().evaluate((el: HTMLInputElement) => el.click());
  await (await chooser).setFiles({ name: "photo.png", mimeType: "image/png", buffer: grey(40, 30) });
  await expect(page.locator("img[src^='blob:']").first()).toBeVisible();

  // Video playback: media-src.
  await page.goto("/media/v-1");
  await page.waitForTimeout(500);

  // The service worker registers (worker-src).
  const registered = await page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration()));
  expect(registered).toBe(true);

  expect(await violations(page)).toEqual([]);
  expect(refused).toEqual([]);
});

test("the deployment guides send exactly these headers", () => {
  const docs = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs");
  for (const guide of ["deployment_guide.md", "deployment_quick.md"]) {
    const text = readFileSync(resolve(docs, guide), "utf8");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(text, `${guide}: ${name}`).toContain(`add_header ${name} "${value}" always;`);
    }
  }
});
