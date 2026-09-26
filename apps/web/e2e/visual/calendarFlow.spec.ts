import { expect, test, type Page, type Request } from "@playwright/test";

import { categories, FIXTURE_NOW, inboundSwap, leoOverview, members, overview } from "../support/calendarFixture";
import { charlie, leo, maya, mockApi } from "../support/mockApi";

// Phase 3 flows against the mocked API: what each screen sends. The API's
// own behaviour (permissions, RLS, persistence) is covered by
// apps/api/src/routes/phase3.test.ts.

async function boot(page: Page, routes: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await page.addInitScript(() => localStorage.setItem("kinnd.childFilter.u-charlie", "c-leo"));
  await mockApi(page, {
    me: charlie,
    children: [leo, maya],
    media: {},
    routes: {
      "GET /overview": overview(leoOverview({ swaps: [inboundSwap] })),
      "GET /categories": { categories },
      "GET /children/c-leo/family": { members },
      ...routes,
    },
  });
}

/** Resolves with the next request matching method + path suffix. */
const nextRequest = (page: Page, method: string, path: string) =>
  page.waitForRequest((r: Request) => r.method() === method && new URL(r.url()).pathname.endsWith(path));

test("request swap sends the picked day and message", async ({ page }) => {
  await boot(page, { "POST /children/c-leo/swap-requests": { ...inboundSwap, id: "s-new", requestedById: "u-charlie" } });
  await page.goto("/calendar?date=2026-10-14");
  await page.getByRole("link", { name: "Request Swap" }).click();
  await expect(page.getByRole("heading", { name: "Request Swap" })).toBeVisible();
  await page.getByRole("button", { name: /October 20th/ }).click();
  await page.getByLabel("Message (optional)").fill("Dentist in town that week");
  const sent = nextRequest(page, "POST", "/children/c-leo/swap-requests");
  await page.getByRole("button", { name: "Send request" }).click();
  expect((await sent).postDataJSON()).toEqual({ date: "2026-10-20", message: "Dentist in town that week" });
});

test("approving an inbound swap resolves it", async ({ page }) => {
  await boot(page, { "PATCH /children/c-leo/swap-requests/s-1": { ...inboundSwap, status: "APPROVED" } });
  await page.goto("/calendar/month");
  const sent = nextRequest(page, "PATCH", "/swap-requests/s-1");
  await page.getByRole("button", { name: "Approve for June 7" }).click();
  expect((await sent).postDataJSON()).toEqual({ status: "APPROVED" });
});

test("new appointment: several categories, Copenhagen time, to-dos and assignee", async ({ page }) => {
  await boot(page, {
    "POST /children/c-leo/calendar-events": { id: "e-new" },
    "GET /children/c-leo/calendar-events/e-new": leoOverview().events[0],
  });
  await page.goto("/events/new?child=c-leo&date=2026-10-14");
  await page.getByLabel("Title").fill("Swimming");
  // Categories: a dropdown where several can be ticked.
  await page.getByLabel("Categories").click();
  await page.getByRole("menuitemcheckbox", { name: /Sport/ }).click();
  await page.getByRole("menuitemcheckbox", { name: /Health/ }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("Starts").fill("16:30");
  await page.getByLabel("Ends").fill("17:15");
  await page.getByLabel("Place").fill("Bellahøj Svømmestadion");
  await page.getByLabel("Add a to-do").fill("Bring towel");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.getByLabel("Handled by").click();
  await page.getByRole("option", { name: "Jonas Nielsen" }).click();
  const sent = nextRequest(page, "POST", "/children/c-leo/calendar-events");
  await page.getByRole("button", { name: "Add appointment" }).click();
  const body = (await sent).postDataJSON();
  expect(body).toMatchObject({
    title: "Swimming",
    categoryIds: ["cat_sport", "cat_health"],
    allDay: false,
    startsAt: "2026-10-14T14:30:00.000Z", // 16:30 CEST
    endsAt: "2026-10-14T15:15:00.000Z",
    location: "Bellahøj Svømmestadion",
    assigneeUserId: "u-dad",
    recurrenceIntervalWeeks: null,
    checklist: [{ label: "Bring towel", kind: "TASK" }],
  });
  await expect(page).toHaveURL(/\/children\/c-leo\/events\/e-new$/);
});

test("ticking a task and adding a note", async ({ page }) => {
  await boot(page, {
    "PATCH /children/c-leo/tasks/t1": { ...leoOverview().tasks[0], completedAt: FIXTURE_NOW.toISOString() },
    "POST /children/c-leo/notes": { id: "n-new" },
  });
  await page.goto("/calendar");
  const ticked = nextRequest(page, "PATCH", "/tasks/t1");
  await page.getByRole("checkbox", { name: "Complete task" }).first().click();
  expect((await ticked).postDataJSON()).toEqual({ completed: true });

  await page.goto("/notes/new?child=c-leo");
  await page.getByLabel("Title").fill("Pickup change");
  await page.getByLabel("Note", { exact: true }).fill("Grandma picks up on Thursday.");
  const sent = nextRequest(page, "POST", "/children/c-leo/notes");
  await page.getByRole("button", { name: "Share note" }).click();
  expect((await sent).postDataJSON()).toEqual({ title: "Pickup change", text: "Grandma picks up on Thursday.", categoryIds: [] });
});

test("create a category in Preferences", async ({ page }) => {
  await boot(page, { "POST /categories": { ...categories[0], id: "cat-swim", key: null, name: "Swimming", ownedByMe: true } });
  await page.goto("/preferences/categories");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Name").fill("Swimming");
  await page.getByRole("radio", { name: "pool" }).click();
  await page.getByRole("radio", { name: "Rose" }).click();
  const sent = nextRequest(page, "POST", "/categories");
  await page.getByRole("dialog").getByRole("button", { name: "Add category" }).click();
  expect((await sent).postDataJSON()).toEqual({ name: "Swimming", icon: "pool", tone: "ROSE" });
});
