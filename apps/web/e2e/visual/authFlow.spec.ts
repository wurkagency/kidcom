import { expect, test, type Page, type Route } from "@playwright/test";
import type { PublicUser } from "@kidcom/shared";

import { leo } from "../support/mockApi";

// The auth flows end to end in the UI, against a stateful fake of the API
// (the real API's side of these flows is covered by apps/api's
// phoneAndPassword / oauth / passwordReset suites). Proves the screens call
// the right endpoints and that the router walks the setup steps in order:
// phone → password → email → app.

const CODE = "123456";

function fakeServer(page: Page, initial: PublicUser | null, children: unknown[] = []) {
  let me = initial;
  const calls: string[] = [];
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body });

  void page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, "");
    const key = `${req.method()} ${path}`;
    const body = req.postDataJSON?.() ?? {};
    calls.push(key);

    switch (key) {
      case "GET /auth/me":
        return json(route, 200, { user: me });
      case "GET /children":
        return json(route, 200, { children });
      case "POST /auth/signup":
        me = {
          id: "u-new",
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          avatarUrl: null,
          emailVerifiedAt: null,
          phone: null,
          phoneVerifiedAt: null,
          pendingPhone: body.phone,
          hasPassword: false,
          oauthProviders: [],
          themeId: null,
          locale: null,
        };
        return json(route, 201, { user: me });
      case "POST /auth/phone/verify":
        if (body.code !== CODE) return json(route, 401, { error: "Incorrect code", code: "CODE_INCORRECT" });
        me = { ...me!, phone: me!.pendingPhone, pendingPhone: null, phoneVerifiedAt: "2026-09-23T10:00:00Z" };
        return json(route, 200, { user: me });
      case "POST /auth/password":
        me = { ...me!, hasPassword: true };
        return json(route, 200, { user: me });
      case "POST /auth/login":
        return json(route, 202, { twoFactorRequired: true });
      case "POST /auth/verify-2fa":
        if (body.code !== CODE) return json(route, 401, { error: "Incorrect code", code: "CODE_INCORRECT" });
        me = verifiedUser;
        return json(route, 200, { user: me });
      default:
        return json(route, 404, { error: `No fake for ${key}` });
    }
  });

  return {
    calls,
    confirmEmail: () => {
      me = { ...me!, emailVerifiedAt: "2026-09-23T10:05:00Z" };
    },
  };
}

const verifiedUser: PublicUser = {
  id: "u-1",
  email: "sarah@example.com",
  firstName: "Sarah",
  lastName: "Jenkins",
  avatarUrl: null,
  emailVerifiedAt: "2026-01-01T00:00:00Z",
  phone: "+4520123456",
  phoneVerifiedAt: "2026-01-01T00:00:00Z",
  pendingPhone: null,
  hasPassword: true,
  oauthProviders: [],
  themeId: null,
  locale: null,
};

test("sign up → verify phone → create password → confirm email → app", async ({ page }) => {
  const server = fakeServer(page, null);
  await page.goto("/signup");

  await page.getByLabel("Full Name").fill("Sarah Jenkins");
  await page.getByLabel("Email address").fill("sarah@example.com");
  await page.getByLabel("Mobile Phone").fill("20 12 34 56");

  // Consent is required before anything is sent.
  await page.getByRole("button", { name: "Start 30-Day Free Trial" }).click();
  await expect(page.getByText("Please accept the Privacy Policy")).toBeVisible();
  expect(server.calls).not.toContain("POST /auth/signup");

  await page.getByLabel(/Privacy Policy/).check();
  await page.getByLabel(/Terms & Conditions/).check();
  await page.getByRole("button", { name: "Start 30-Day Free Trial" }).click();

  // Step 1: phone — the number is shown masked, a wrong code is rejected.
  await expect(page).toHaveURL(/\/verify-phone$/);
  await expect(page.getByText("+45 ••••••56")).toBeVisible();
  await page.getByLabel("6-digit code").fill("000000");
  await expect(page.getByText("That code isn't right")).toBeVisible();
  await expect(page.getByLabel("6-digit code")).toHaveValue(""); // cleared for the next attempt
  await page.getByLabel("6-digit code").fill(CODE);

  // Step 2: password — rules checked live; mismatch blocks submit.
  await expect(page).toHaveURL(/\/create-password$/);
  await page.getByLabel("New Password").fill("calm-harbour-7");
  await expect(page.getByText("At least 8 characters")).toBeVisible();
  await page.getByLabel("Confirm Password").fill("calm-harbour-8");
  await expect(page.getByText("The passwords don't match")).toBeVisible();
  await page.getByLabel("Confirm Password").fill("calm-harbour-7");
  await page.getByRole("button", { name: "Save Password & Continue" }).click();

  // Step 3: email.
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByText("sarah@example.com")).toBeVisible();
  server.confirmEmail();
  await page.getByRole("button", { name: "I've confirmed my email" }).click();

  // In the app: a brand-new account has no children yet, so onboarding starts.
  await expect(page).toHaveURL(/\/onboarding\/child$/);
  expect(server.calls).toEqual(expect.arrayContaining(["POST /auth/signup", "POST /auth/phone/verify", "POST /auth/password"]));
});

test("sign in with password, then the emailed code, returns to where the user was going", async ({ page }) => {
  fakeServer(page, null, [leo]);
  await page.goto("/lists");
  await expect(page).toHaveURL(/\/login\?next=%2Flists$/);

  await page.getByLabel("Email").fill("sarah@example.com");
  await page.getByLabel("Password", { exact: true }).fill("calm-harbour-7");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/login\/verify\?email=sarah%40example\.com&next=%2Flists$/);
  await expect(page.getByText("sarah@example.com")).toBeVisible();
  await page.getByLabel("6-digit code").fill(CODE);

  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByRole("link", { name: "Lists" })).toHaveAttribute("aria-current", "page");
});

test("a signed-in account with an unverified phone can't reach the app", async ({ page }) => {
  fakeServer(page, { ...verifiedUser, phone: null, phoneVerifiedAt: null, pendingPhone: "+4520123456" });
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/verify-phone$/);
  await page.goto("/create-password");
  await expect(page).toHaveURL(/\/verify-phone$/); // steps can't be skipped
});

test("someone stuck mid-setup can still reach login and sign-up to start over", async ({ page }) => {
  fakeServer(page, { ...verifiedUser, phone: null, phoneVerifiedAt: null, pendingPhone: "+4520123456" });
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Google" })).toBeVisible();
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
});

test("Google/Microsoft buttons start the provider flow, carrying consent from sign-up", async ({ page }) => {
  fakeServer(page, null);
  await page.goto("/signup");
  const google = page.getByRole("link", { name: "Google" });

  await google.click(); // no consent yet: stays here
  await expect(page.getByText("Please accept the Privacy Policy")).toBeVisible();

  await page.getByLabel(/Privacy Policy/).check();
  await page.getByLabel(/Terms & Conditions/).check();
  await expect(google).toHaveAttribute("href", "/api/auth/oauth/google/start?acceptedTerms=1");
  await expect(page.getByRole("link", { name: "Microsoft" })).toHaveAttribute("href", "/api/auth/oauth/microsoft/start?acceptedTerms=1");
});
