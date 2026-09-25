import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import { comparePage, loadReference, referenceHtml, referencePng } from "../support/compare";
import { mockApi } from "../support/mockApi";

// Signed-out auth screens vs docs/design/aura. Full-page comparison at the
// Stitch geometry (390 CSS px @1.5x). Thresholds are set just above the
// measured values so a regression fails the test.

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function shoot(page: Page) {
  return page.screenshot({ fullPage: true });
}

/** The viewport the export was captured at (its PNG is 1.5x CSS pixels). */
async function referenceViewport(page: Page, folder: string) {
  const ref = loadReference(folder);
  await page.setViewportSize({ width: ref.width / 1.5, height: Math.round(ref.height / 1.5) });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page, { me: null, children: [], media: {} });
});

test("sign up matches kinnd_sign_up", async ({ page }) => {
  await referenceViewport(page, "kinnd_sign_up");
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  // The reference was captured with its sample values typed in.
  await page.getByLabel("Full Name").fill("Sarah Jenkins");
  await page.getByLabel("Email address").fill("sarah.jenkins@example.com");
  await page.getByLabel("Mobile Phone").fill("20 12 34 56");
  await page.getByLabel("Mobile Phone").blur();
  await settle(page);
  // Deliberate change: the export's subtitle "…Choose your role below." (no
  // role picker exists) is shortened to one line, lifting everything below
  // it by one 22.75px line (34 reference px) from y≈420.
  const { mismatch, heightDelta } = comparePage(await shoot(page), referencePng("kinnd_sign_up"), "kinnd_sign_up", {
    atY: 425,
    by: 34,
  });
  console.log(`sign up: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(0.012);
});

test("forgot password matches kinnd_forgot_password", async ({ page }) => {
  await referenceViewport(page, "kinnd_forgot_password");
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await settle(page);
  const { mismatch, heightDelta } = comparePage(await shoot(page), referencePng("kinnd_forgot_password"), "kinnd_forgot_password");
  console.log(`forgot: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(0.01);
});

test("login matches kinnd_login (with the export's own photo)", async ({ page, request }) => {
  // Layout fidelity, not photography: serve the Stitch export's photo in
  // place of the owner-supplied hero for this comparison only.
  const html = readFileSync(referenceHtml("kinnd_login"), "utf8");
  const photoUrl = html.match(/<img[^>]+src="(https:\/\/lh3\.googleusercontent[^"]+)"/)?.[1];
  test.skip(!photoUrl, "export photo URL not found");
  const photo = await (await request.get(photoUrl!)).body();
  // Only the <img> fetch — in dev, Vite's JS module for the import has the same path.
  await page.route(
    (url) => url.pathname.endsWith("auth-hero.jpg"),
    (route) =>
      route.request().resourceType() === "image" ? route.fulfill({ body: photo, contentType: "image/jpeg" }) : route.fallback(),
  );

  await referenceViewport(page, "kinnd_login");
  await page.goto("/login");
  await expect(page.getByText("Log in", { exact: true })).toBeVisible();
  await page.getByLabel("Email").fill("you@kinnd.eu"); // the reference renders these values
  await page.getByLabel("Password", { exact: true }).fill("password1234");
  await page.getByLabel("Password", { exact: true }).blur();
  await settle(page);
  const { mismatch, heightDelta } = comparePage(await shoot(page), referencePng("kinnd_login"), "kinnd_login");
  console.log(`login: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(0.025);
});

test("reset password matches a render of kinnd_reset_password", async ({ page, browser }) => {
  // The export's screen.png is corrupt, so render its code.html instead.
  const refPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
  await refPage.goto(`file://${referenceHtml("kinnd_reset_password")}`);
  await refPage.waitForLoadState("networkidle");
  await refPage.evaluate(() => document.fonts.ready);
  const reference = await refPage.screenshot({ fullPage: true });
  await refPage.close();

  await page.goto("/reset-password?token=abc");
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await settle(page);
  // Deliberate change: the export's confirm-password field lost its <input>
  // (only the eye toggle rendered, at y≈870); the restored field adds rows.
  const { mismatch, heightDelta } = comparePage(await shoot(page), reference, "kinnd_reset_password", { atY: 855, by: -93 });
  console.log(`reset: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(0.04);
});
