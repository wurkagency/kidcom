import { expect, test, type Page, type Request } from "@playwright/test";
import { PNG } from "pngjs";

import { members } from "../support/calendarFixture";
import { comparePage, loadReference, referencePng } from "../support/compare";
import { charlie, ida, leo, maya, mockApi } from "../support/mockApi";
import { FIXTURE_NOW, ingerMessages, ingerThread, notifications, searchResults, threads } from "../support/messagesFixture";

// Messages inbox + conversation vs docs/design/aura, then the Phase 6 flows
// (send, photo, new conversation, notifications, search) against the
// mocked API with the request bodies asserted. The family is in Copenhagen.

function grey(width = 8, height = 6): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([204, 204, 204, 255], i);
  return PNG.sync.write(png);
}

const mediaIds = ["p-1", "p-2", "a-u-inger", "a-u-dad", "a-u-erik", "a-u-peter", "a-u-henriette"];

async function open(page: Page, path: string, size?: { width: number; height: number }) {
  await page.setViewportSize(size ?? { width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: { ...charlie, region: "DK" },
    children: [leo, maya, ida],
    media: Object.fromEntries(mediaIds.map((id) => [id, grey()])),
    routes: {
      "GET /messages/threads": { items: threads },
      "GET /messages/threads/t-inger": ingerThread,
      "GET /messages/threads/t-inger/messages": { items: ingerMessages, hasMore: false },
      "POST /messages/threads/t-inger/messages": { ...ingerMessages[4], id: "m-new", text: "See you!", senderId: "u-charlie", senderName: "Charlie Nielsen" },
      "POST /media/upload": { id: "p-new", type: "IMAGE", status: "PROCESSING" },
      "POST /messages/threads": { id: "t-inger" },
      "GET /children/c-leo/family": { members },
      "GET /children/c-maya/family": { members },
      "GET /children/c-ida/family": { members },
      "GET /notifications": { items: notifications, unreadCount: 1, nextCursor: null },
      "POST /notifications/read": {},
      "GET /search": searchResults,
    },
  });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function check(page: Page, folder: string, limit: number) {
  const shot = await page.screenshot({ fullPage: true });
  await page.screenshot({ path: `e2e/.results/${folder}.png`, fullPage: true });
  const { mismatch, heightDelta } = comparePage(shot, referencePng(folder), folder);
  console.log(`${folder}: ${(mismatch * 100).toFixed(2)}% mismatch, height Δ ${heightDelta}px`);
  expect(mismatch).toBeLessThan(limit);
}

const refSize = (folder: string) => {
  const ref = loadReference(folder);
  return { width: ref.width / 1.5, height: Math.round(ref.height / 1.5) };
};

test("inbox matches kidcom_messages_1", async ({ page }) => {
  await open(page, "/messages", refSize("kidcom_messages_1"));
  await expect(page.getByText("Yesterday")).toBeVisible();
  await expect(page.getByText("19.09.2026").first()).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible(); // Peter's unread count
  await check(page, "kidcom_messages_1", 0.055);
});

test("conversation matches kidcom_calendar_5", async ({ page }) => {
  await open(page, "/messages/t-inger", refSize("kidcom_calendar_5"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByText("Art for Grandma")).toBeVisible();
  await expect(page.getByText(/^Today • 12 October 2026$/i)).toBeVisible();
  // Most of the gap: the export's two full-colour photos (flat grey here) and its "Active now" line (no presence).
  await check(page, "kidcom_calendar_5", 0.205);
});

const body = (r: Request) => r.postDataJSON() as Record<string, unknown>;
const sent = (page: Page, method: string, path: string) => page.waitForRequest((r) => r.method() === method && new URL(r.url()).pathname === `/api${path}`);

test("send a message", async ({ page }) => {
  await open(page, "/messages/t-inger");
  await page.getByRole("textbox", { name: "Type a message or note..." }).fill("See you!");
  const post = sent(page, "POST", "/messages/threads/t-inger/messages");
  await page.getByRole("button", { name: "Send message" }).click();
  expect(body(await post)).toEqual({ text: "See you!" });
  await expect(page.getByRole("textbox", { name: "Type a message or note..." })).toHaveValue("");
});

test("send a photo with a caption", async ({ page }) => {
  await open(page, "/messages/t-inger");
  await page.getByRole("textbox", { name: "Type a message or note..." }).fill("Lego castle");
  const post = sent(page, "POST", "/messages/threads/t-inger/messages");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add a photo" }).click();
  await (await chooser).setFiles({ name: "castle.png", mimeType: "image/png", buffer: grey() });
  expect(body(await post)).toEqual({ mediaId: "p-new", text: "Lego castle" });
});

test("start a conversation from the people you share a child with", async ({ page }) => {
  await open(page, "/messages/new");
  await page.getByRole("checkbox", { name: "Message Inger Nielsen" }).click();
  const create = sent(page, "POST", "/messages/threads");
  await page.getByRole("button", { name: "Start conversation" }).click();
  expect(body(await create)).toEqual({ memberUserIds: ["u-inger"] });
  await expect(page).toHaveURL(/\/messages\/t-inger$/);
});

test("notifications list new ones tinted and marks them read", async ({ page }) => {
  const read = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/notifications/read"));
  await open(page, "/notifications");
  await expect(page.getByText("Jonas added to the calendar")).toBeVisible();
  await expect(page.getByText("Dentist · Wed, 14 Oct, 10.00")).toBeVisible();
  await expect(page.getByText("Inger will get it")).toBeVisible();
  await read;
});

test("search finds across the app and opens the result", async ({ page }) => {
  await open(page, "/search");
  await page.getByRole("searchbox", { name: "Search KidCom" }).fill("den");
  await expect(page.getByText("Calendar", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Dentist/ }).click();
  await expect(page).toHaveURL(/\/children\/c-leo\/events\/e-dentist$/);
});
