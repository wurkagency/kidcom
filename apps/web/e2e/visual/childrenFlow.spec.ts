import { expect, test, type Page, type Request } from "@playwright/test";

import { charlie, mockApi } from "../support/mockApi";
import { augustDetail, contacts, custody, FIXTURE_NOW, growth, listItems, schedule, stenbeckFamily, stenbecks } from "../support/childrenFixture";

// Phase 5 flows against the mocked API: claim with a note, child selection,
// adding a measurement, editing a relationship and picking a custody rhythm.
// Each asserts the request the screen sends.

const shoes = listItems[0]!;
const claimedShoes = { ...shoes, claimedById: "u-charlie", claimedByName: "Charlie", claimedAt: FIXTURE_NOW.toISOString() };

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: charlie,
    children: stenbecks,
    media: {},
    routes: {
      "GET /lists": { items: listItems },
      "PATCH /children/c-august/lists/li-shoes/claim": claimedShoes,
      "GET /children/c-august": augustDetail,
      "GET /children/c-august/family": { members: stenbeckFamily },
      "PATCH /children/c-august/family/u-inger": {},
      "GET /children/c-august/custody-plan": custody,
      "PUT /children/c-august/custody-plan": custody.plan,
      "GET /children/c-august/growth-entries": { items: growth },
      "POST /children/c-august/growth-entries": { id: "g5", measuredAt: "2026-10-12T12:00:00.000Z", heightCm: 149, weightKg: 49, note: null },
      "GET /children/c-august/emergency-contacts": { items: contacts },
      "GET /children/c-august/schedule": { items: schedule, completedCount: 12, totalCount: 20 },
    },
  });
  await page.goto(path);
}

const body = (r: Request) => r.postDataJSON() as Record<string, unknown>;
const sent = (page: Page, method: string, path: string) =>
  page.waitForRequest((r) => r.method() === method && new URL(r.url()).pathname === `/api${path}`);

test("claim a necessity", async ({ page }) => {
  await open(page, "/lists");
  const claim = sent(page, "PATCH", "/children/c-august/lists/li-shoes/claim");
  await page.getByRole("button", { name: "I'll get it" }).first().click();
  expect(body(await claim)).toEqual({ claimed: true });
});

test("add a note to my claim", async ({ page }) => {
  await open(page, "/lists");
  await page.getByRole("button", { name: "Add a note" }).click();
  await page.getByRole("textbox", { name: "Note for the family" }).fill("Bought at Magasin");
  const note = sent(page, "PATCH", "/children/c-some/lists/li-socks/claim");
  await page.getByRole("button", { name: "Save note" }).click();
  expect(body(await note)).toEqual({ note: "Bought at Magasin" });
});

test("select children", async ({ page }) => {
  await open(page, "/children");
  await expect(page.getByText("3 children selected")).toBeVisible();
  // With everyone selected the rows are unticked (as in the export): a tap narrows to that child.
  await page.getByRole("checkbox", { name: "Select Some kid" }).click();
  await expect(page.getByText("1 child selected")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select August Stenbeck" }).click();
  await expect(page.getByText("2 children selected")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select August Stenbeck" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select all" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Select all" }).click();
  await expect(page.getByText("3 children selected")).toBeVisible();
});

test("add a measurement", async ({ page }) => {
  await open(page, "/children/c-august");
  await page.getByRole("link", { name: "Add new height and weight" }).click();
  await page.getByLabel("Height", { exact: true }).fill("149");
  await page.getByLabel("Weight", { exact: true }).fill("49");
  const add = sent(page, "POST", "/children/c-august/growth-entries");
  await page.getByRole("button", { name: "Save changes" }).click();
  expect(body(await add)).toMatchObject({ heightCm: 149, weightKg: 49 });
});

test("edit a relationship", async ({ page }) => {
  await open(page, "/children/c-august");
  await page.getByRole("button", { name: "Edit Inger Lind" }).click();
  await page.getByRole("combobox", { name: "Relationship" }).click();
  await page.getByRole("option", { name: "Grandmother (father's side)" }).click();
  const rel = sent(page, "PATCH", "/children/c-august/family/u-inger");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(body(await rel)).toEqual({ relationship: "GRANDMOTHER_PAT" });
});

for (const [name, days] of [
  ["9/5", [9, 5]],
  ["14/2", [14, 2]],
] as const) {
  test(`custody plan: ${name} rhythm`, async ({ page }) => {
    await open(page, "/children/c-august/custody");
    await page.getByRole("radio", { name: new RegExp(`^${name}`) }).click();
    const put = sent(page, "PUT", "/children/c-august/custody-plan");
    await page.getByRole("button", { name: "Save plan" }).click();
    const plan = body(await put) as { label: string; patternDays: { cycleLengthDays: number; blocks: { userId: string; days: number }[] } };
    expect(plan.label).toBe(name);
    expect(plan.patternDays.cycleLengthDays).toBe(days[0] + days[1]);
    expect(plan.patternDays.blocks).toEqual([
      { userId: "u-anna", days: days[0] },
      { userId: "u-charlie", days: days[1] },
    ]);
  });
}
