import { expect, test, type Page, type Request } from "@playwright/test";

import { members } from "../support/calendarFixture";
import { charlie, ida, leo, maya, mockApi } from "../support/mockApi";
import { FIXTURE_NOW } from "../support/messagesFixture";
import { familySub, freeSub, plans } from "../support/billingFixture";

// Phase 7 flows against the mocked API, request bodies asserted: the
// profile menu, account (number change, deletion blocked), checkout with the
// withdrawal consent → QuickPay → back and confirmed, preferences (country
// formats, notifications), security, invite accept, and onboarding.

const prefs = {
  emailEnabled: false,
  googleCalendarSyncEnabled: false,
  office365SyncEnabled: false,
  categoryCalendar: true,
  categoryMoments: true,
  categoryLists: false,
  categoryMessages: true,
  doNotDisturb: true,
  quietHoursFrom: "21:00",
  quietHoursTo: "07:00",
};

async function open(page: Page, path: string, extra: Record<string, unknown> = {}, opts: { children?: typeof leo[]; me?: typeof charlie | null } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: opts.me === undefined ? { ...charlie, region: "DK" } : opts.me,
    children: opts.children ?? [leo, maya, ida],
    media: {},
    routes: {
      "GET /messages/threads": { items: [] },
      "GET /billing/status": freeSub,
      "GET /billing/plans": plans,
      "GET /children/c-leo/family": { members },
      "GET /children/c-maya/family": { members },
      "GET /children/c-ida/family": { members },
      "GET /notification-preferences": prefs,
      "PATCH /notification-preferences": { ...prefs, categoryLists: true },
      "PATCH /auth/me": { user: { ...charlie, region: "NO" } },
      "GET /auth/sessions": { otherSessions: 2 },
      "POST /auth/sessions/revoke-others": { revoked: 2 },
      ...extra,
    },
  });
  await page.goto(path);
}

const body = (r: Request) => r.postDataJSON() as Record<string, unknown>;
const sent = (page: Page, method: string, path: string) => page.waitForRequest((r) => r.method() === method && new URL(r.url()).pathname === `/api${path}`);

test("profile menu leads to every area", async ({ page }) => {
  await open(page, "/profile");
  for (const name of ["Family", "Children", "Messages", "Bookmarks", "Account", "Plan & billing", "Preferences"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /Plan & billing\s*Single/ })).toBeVisible();
  await page.getByRole("link", { name: /^Family/ }).click();
  await expect(page.getByText("Jonas Nielsen")).toBeVisible();
  await expect(page.getByText("Father to Leo")).toBeVisible();
});

test("changing the mobile number texts the new one first", async ({ page }) => {
  await open(page, "/profile/account", { "POST /auth/phone/send": {} });
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("textbox", { name: /phone|mobile/i }).fill("20 98 76 54");
  const send = sent(page, "POST", "/auth/phone/send");
  await page.getByRole("button", { name: "Send code" }).click();
  expect(body(await send)).toEqual({ phone: "+4520987654" });
  await expect(page.getByRole("button", { name: "Confirm new number" })).toBeVisible();
});

test("deleting the account names the children it would leave without a parent", async ({ page }) => {
  await open(page, "/profile/account");
  await page.route((url) => url.pathname === "/api/auth/me", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 409, json: { error: "last guardian", code: "LAST_GUARDIAN", details: { children: [{ childId: "c-leo", firstName: "Leo" }] } } })
      : route.fallback(),
  );
  await page.getByRole("button", { name: /Delete account/ }).click();
  const del = sent(page, "DELETE", "/auth/me");
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
  expect(body(await del)).toEqual({ confirm: true });
  await expect(page.getByText("You're the last parent or guardian of Leo.", { exact: false })).toBeVisible();
});

test("checkout needs the consent, goes to QuickPay and is confirmed on return", async ({ page }) => {
  await open(page, "/billing/checkout", {
    "POST /billing/subscribe": { redirectUrl: "https://payment.quickpay.net/subscriptions/test" },
    "POST /billing/confirm": familySub,
  });
  await page.route("https://payment.quickpay.net/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>QuickPay test window</h1>" }));
  await expect(page.getByText("621,00 kr.")).toBeVisible(); // DK formats
  await page.getByRole("radio", { name: /^Family/ }).click();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText("Please confirm you want the plan to start now.")).toBeVisible();

  await page.getByRole("checkbox", { name: "Start now and waive the right of withdrawal" }).click();
  const subscribe = sent(page, "POST", "/billing/subscribe");
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  expect(body(await subscribe)).toEqual({ tier: "FAMILY", billingPeriod: "ANNUAL", acceptWithdrawalWaiver: true });
  await expect(page.getByRole("heading", { name: "QuickPay test window" })).toBeVisible();

  const confirm = sent(page, "POST", "/billing/confirm");
  await page.goto("/billing?checkout=success");
  await confirm;
  await expect(page.getByText("Welcome to your Family Circle — thank you!")).toBeVisible();
  await expect(page.getByText("12.10.2027")).toBeVisible();
});

test("with the trial still available, a paid plan starts 30 days free without a card", async ({ page }) => {
  const trialing = {
    ...familySub,
    status: "TRIALING",
    billingPeriod: null,
    currentPeriodEnd: null,
    trialEndsAt: "2026-11-01T07:00:00Z",
    cardOnFile: false,
  };
  await open(page, "/billing/checkout", { "GET /billing/status": { ...freeSub, trialAvailable: true }, "POST /billing/trial": trialing });
  await page.getByRole("radio", { name: /^Family/ }).click();
  await expect(page.getByText("No card needed.", { exact: false })).toBeVisible();
  const trial = sent(page, "POST", "/billing/trial");
  await page.getByRole("button", { name: "Start 30 days free" }).click();
  expect(body(await trial)).toEqual({ tier: "FAMILY" });
});

test("country formats and notification switches save", async ({ page }) => {
  await open(page, "/preferences/language");
  const patch = sent(page, "PATCH", "/auth/me");
  await page.getByRole("button", { name: /^Norway/ }).click();
  expect(body(await patch)).toEqual({ region: "NO" });

  await page.goto("/preferences/notifications");
  const prefsPatch = sent(page, "PATCH", "/notification-preferences");
  await page.getByRole("switch", { name: "List items being claimed" }).click();
  expect(body(await prefsPatch)).toEqual({ categoryLists: true });
});

test("security signs out the other devices", async ({ page }) => {
  await open(page, "/preferences/security");
  await expect(page.getByText("Signed in on 2 other devices")).toBeVisible();
  const revoke = sent(page, "POST", "/auth/sessions/revoke-others");
  await page.getByRole("button", { name: "Sign out all other devices" }).click();
  await revoke;
  await expect(page.getByText("Only this device is signed in")).toBeVisible();
});

test("an invite link creates the account for the invited email", async ({ page }) => {
  await open(
    page,
    "/invite/tok123",
    {
      "GET /invites/tok123": { valid: true, email: "inger@example.com", childName: "Leo", inviterName: "Charlie Nielsen", userExists: false, relationship: "GRANDMOTHER_MAT" },
      "POST /invites/tok123/accept": { user: { ...charlie, id: "u-inger", firstName: "Inger", phoneVerifiedAt: null, phone: null } },
    },
    { me: null },
  );
  await expect(page.getByRole("heading", { name: "Join Leo's family" })).toBeVisible();
  await expect(page.getByText("Charlie Nielsen invited you as Grandmother (mother's side).")).toBeVisible();
  await page.getByLabel("First name").fill("Inger");
  await page.getByLabel("Last name").fill("Lind");
  await page.getByLabel("New password").fill("Calm-Harbour-7");
  await page.getByLabel(/Confirm/).fill("Calm-Harbour-7");
  const accept = sent(page, "POST", "/invites/tok123/accept");
  await page.getByRole("button", { name: "Create account and join" }).click();
  expect(body(await accept)).toEqual({ firstName: "Inger", lastName: "Lind", password: "Calm-Harbour-7" });
});

test("someone with no children starts onboarding", async ({ page }) => {
  await open(page, "/", {}, { children: [] });
  await expect(page).toHaveURL(/\/onboarding\/child$/);
  await expect(page.getByRole("heading", { name: "Welcome, Charlie" })).toBeVisible();
  await expect(page.getByLabel("Step 1 of 3")).toBeVisible();
});
