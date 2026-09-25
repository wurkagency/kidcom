import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { categories, FIXTURE_NOW, inboundSwap, leoOverview, members, overview } from "../support/calendarFixture";
import { augustDetail, contacts, custody, growth, listItems, schedule, stenbeckFamily, stenbecks } from "../support/childrenFixture";
import { ingerMessages, ingerThread, notifications, threads } from "../support/messagesFixture";
import { comments, feed, gallery, homeRun } from "../support/momentsFixture";
import { familySub, plans } from "../support/billingFixture";
import { charlie, mockApi } from "../support/mockApi";

// Accessibility (WCAG 2.1 A/AA via axe-core) on every main screen, with the
// same mocked content as the visual specs. Serious and critical findings
// fail; colour contrast is checked too — Aura's secondary text included.

const SCREENS: [string, string][] = [
  ["Today", "/"],
  ["Calendar", "/calendar"],
  ["Month", "/calendar/month"],
  ["Moments", "/moments"],
  ["Moment", "/children/c-leo/moments/m-homerun"],
  ["Gallery", "/media"],
  ["Lists", "/lists"],
  ["Children", "/children"],
  ["Child profile", "/children/c-august"],
  ["Health", "/children/c-august/health"],
  ["Messages", "/messages"],
  ["Conversation", "/messages/t-inger"],
  ["Notifications", "/notifications"],
  ["Search", "/search"],
  ["Profile", "/profile"],
  ["Account", "/profile/account"],
  ["Billing", "/billing"],
  ["Checkout", "/billing/checkout"],
  ["Preferences", "/preferences"],
  ["Notification settings", "/preferences/notifications"],
  ["Security", "/preferences/security"],
];

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXTURE_NOW);
  await mockApi(page, {
    me: { ...charlie, region: "DK" },
    children: [...stenbecks, { ...stenbecks[0]!, id: "c-leo", firstName: "Leo" }],
    media: {},
    routes: {
      "GET /overview": overview(leoOverview({ swaps: [inboundSwap] })),
      "GET /categories": { categories },
      "GET /children/c-leo/family": { members },
      "GET /moments": { items: feed, nextCursor: null },
      "GET /moments/media": { items: gallery },
      "GET /children/c-leo/moments/m-homerun": homeRun,
      "GET /children/c-leo/moments/m-homerun/comments": { items: comments },
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
      "GET /billing/status": familySub,
      "GET /billing/plans": plans,
      "GET /notification-preferences": { emailEnabled: false, googleCalendarSyncEnabled: false, office365SyncEnabled: false, categoryCalendar: true, categoryMoments: true, categoryLists: false, categoryMessages: true, doNotDisturb: true, quietHoursFrom: "21:00", quietHoursTo: "07:00" },
      "GET /auth/sessions": { otherSessions: 1 },
    },
  });
  await page.goto(path);
  await page.locator("main h1, main h2").first().waitFor();
  await page.waitForTimeout(300);
}

for (const [name, path] of SCREENS) {
  test(`a11y: ${name}`, async ({ page }) => {
    await open(page, path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = blocking.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(report, report.join("\n")).toEqual([]);
  });
}
