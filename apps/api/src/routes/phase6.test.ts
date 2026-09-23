import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRlsBypass } from "../lib/rls";
import { processImage, processedColumns } from "../lib/mediaProcessing";
import { inQuietHours, wantsPush } from "../lib/notify";

// v3.0 Phase 6: the in-app notification list, conversations (unread counts,
// newest-first paging, photos the other members can open), search over
// calendar events.

async function family() {
  const app = createApp();
  const mom = await signupTestUser(app, { firstName: "Mia" });
  const leo = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2015-07-31", relationship: "MOTHER" })).body.id as string;
  const dad = await signupTestUser(app, { firstName: "Dan" });
  await prisma.childAccess.create({ data: { childId: leo, userId: dad.userId, role: "PARENT", relationship: "FATHER" } });
  const gran = await signupTestUser(app, { firstName: "Inger" });
  await prisma.childAccess.create({ data: { childId: leo, userId: gran.userId, role: "FAMILY", relationship: "GRANDMOTHER_MAT" } });
  const outsider = await signupTestUser(app, { firstName: "Olaf" });
  return { app, leo, mom, dad, gran, outsider };
}

describe("Notifications", () => {
  beforeEach(resetDb);

  it("a new event is listed for the rest of the family, in kind + params, and read when opened", async () => {
    const { mom, dad, gran, leo } = await family();
    const created = await mom.agent.post(`/children/${leo}/calendar-events`).send({ title: "Dentist", startsAt: "2026-10-14T08:00:00.000Z" });
    expect(created.status).toBe(201);

    const list = await dad.agent.get("/notifications");
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      kind: "event.created",
      params: { actor: "Mia", title: "Dentist", startsAt: "2026-10-14T08:00:00.000Z" },
      url: `/children/${leo}/events/${created.body.id}`,
      childId: leo,
      actorId: mom.userId,
      read: false,
    });
    expect((await gran.agent.get("/notifications")).body.items).toHaveLength(1);
    expect((await mom.agent.get("/notifications")).body.items).toHaveLength(0); // never the actor

    expect((await dad.agent.post("/notifications/read")).status).toBe(204);
    const after = await dad.agent.get("/notifications");
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.items[0].read).toBe(true);
    expect((await gran.agent.get("/notifications")).body.unreadCount).toBe(1); // only your own
  });

  it("claims, moments and swaps notify the right people; messages don't fill the list", async () => {
    const { mom, dad, gran, leo } = await family();
    const item = (await mom.agent.post(`/children/${leo}/lists`).send({ type: "NECESSITY", title: "Rain boots" })).body;
    await gran.agent.patch(`/children/${leo}/lists/${item.id}/claim`).send({ claimed: true, note: "Size 28" });
    await gran.agent.patch(`/children/${leo}/lists/${item.id}/claim`).send({ note: "Size 29" }); // a note edit isn't news
    const momList = (await mom.agent.get("/notifications")).body.items;
    expect(momList.map((n: { kind: string }) => n.kind)).toEqual(["list.claimed"]);
    expect(momList[0].params).toMatchObject({ actor: "Inger", title: "Rain boots" });

    await mom.agent.post(`/children/${leo}/moments`).send({ title: "Home run", familyVisible: false, notify: true });
    for (let i = 0; i < 20 && !(await prisma.notification.count({ where: { kind: "moment.shared" } })); i++) await new Promise((r) => setTimeout(r, 100));
    expect((await gran.agent.get("/notifications")).body.items.some((n: { kind: string }) => n.kind === "moment.shared")).toBe(false);
    expect((await dad.agent.get("/notifications")).body.items.some((n: { kind: string }) => n.kind === "moment.shared")).toBe(true);

    const thread = (await mom.agent.post("/messages/threads").send({ memberUserIds: [dad.userId] })).body.id;
    await mom.agent.post(`/messages/threads/${thread}/messages`).send({ text: "Hi" });
    expect((await dad.agent.get("/notifications")).body.items.some((n: { kind: string }) => n.kind === "message.received")).toBe(false);
  });

  it("pushes respect categories and quiet hours (Copenhagen clock, over midnight)", () => {
    const prefs = { categoryCalendar: true, categoryMoments: false, categoryLists: false, categoryMessages: true, doNotDisturb: true, quietHoursFrom: "21:00", quietHoursTo: "07:00" };
    const noon = new Date("2026-10-12T10:00:00Z"); // 12:00 CEST
    const night = new Date("2026-10-12T21:30:00Z"); // 23:30 CEST
    const early = new Date("2026-10-13T04:30:00Z"); // 06:30 CEST
    expect(inQuietHours("21:00", "07:00", noon)).toBe(false);
    expect(inQuietHours("21:00", "07:00", night)).toBe(true);
    expect(inQuietHours("21:00", "07:00", early)).toBe(true);
    expect(inQuietHours("13:00", "14:00", new Date("2026-10-12T11:30:00Z"))).toBe(true);
    expect(wantsPush(prefs, "calendar", noon)).toBe(true);
    expect(wantsPush(prefs, "moments", noon)).toBe(false);
    expect(wantsPush(prefs, "calendar", night)).toBe(false);
    expect(wantsPush({ ...prefs, doNotDisturb: false }, "calendar", night)).toBe(true);
    expect(wantsPush(prefs, "account", night)).toBe(true); // billing always gets through
  });
});

describe("Conversations", () => {
  beforeEach(resetDb);

  it("counts unread messages per thread and pages newest first", async () => {
    const { mom, dad } = await family();
    const thread = (await mom.agent.post("/messages/threads").send({ memberUserIds: [dad.userId] })).body.id;
    const base = Date.parse("2026-01-01T08:00:00Z");
    await prisma.message.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({ threadId: thread, senderId: mom.userId, text: `m${i}`, createdAt: new Date(base + i * 60_000) })),
    });

    const inbox = await dad.agent.get("/messages/threads");
    expect(inbox.body.items[0]).toMatchObject({ unread: true, unreadCount: 60 });
    expect((await mom.agent.get("/messages/threads")).body.items[0]).toMatchObject({ unread: false, unreadCount: 0 });

    const first = await dad.agent.get(`/messages/threads/${thread}/messages`);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items[0].text).toBe("m10");
    expect(first.body.items.at(-1).text).toBe("m59");
    expect(first.body.hasMore).toBe(true);
    const older = await dad.agent.get(`/messages/threads/${thread}/messages?before=${first.body.items[0].id}`);
    expect(older.body.items.map((m: { text: string }) => m.text)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`));
    expect(older.body.hasMore).toBe(false);

    expect((await dad.agent.get("/messages/threads")).body.items[0]).toMatchObject({ unread: false, unreadCount: 0 });
  });

  it("a photo sent in a conversation opens for its members only", async () => {
    const { mom, dad, gran, outsider } = await family();
    const thread = (await mom.agent.post("/messages/threads").send({ memberUserIds: [dad.userId] })).body.id;
    const photo = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#d8e8e1" } }).png().toBuffer();
    const upload = await mom.agent.post("/media/upload").attach("file", photo, { filename: "art.png", contentType: "image/png" });
    const asset = await withRlsBypass((tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id: upload.body.id } }));
    const done = await processImage(asset);
    await withRlsBypass((tx) => tx.mediaAsset.update({ where: { id: asset.id }, data: processedColumns(done) }));

    expect((await dad.agent.get(`/media/${asset.id}`)).status).toBe(404); // not sent yet: invisible
    const sent = await mom.agent.post(`/messages/threads/${thread}/messages`).send({ text: "Art for Grandma", mediaId: asset.id });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ mediaId: asset.id, text: "Art for Grandma" });

    expect((await dad.agent.get(`/media/${asset.id}`)).status).toBe(200);
    expect([403, 404]).toContain((await gran.agent.get(`/media/${asset.id}`)).status);
    expect([403, 404]).toContain((await outsider.agent.get(`/media/${asset.id}`)).status);
    // Someone else's photo can't be forwarded into a thread.
    const dadThread = (await dad.agent.post("/messages/threads").send({ memberUserIds: [gran.userId] })).body.id;
    expect((await dad.agent.post(`/messages/threads/${dadThread}/messages`).send({ mediaId: asset.id })).status).toBe(403);
  });
});

describe("Search", () => {
  beforeEach(resetDb);

  it("finds calendar events, upcoming first, only for children you can see", async () => {
    const { mom, dad, outsider, leo } = await family();
    await mom.agent.post(`/children/${leo}/calendar-events`).send({ title: "Dentist check", startsAt: "2020-01-10T08:00:00.000Z" });
    await mom.agent.post(`/children/${leo}/calendar-events`).send({ title: "Dentist cleaning", startsAt: "2099-01-10T08:00:00.000Z", location: "Oakwood" });

    const res = await dad.agent.get("/search?q=dentist");
    expect(res.body.events.map((e: { title: string }) => e.title)).toEqual(["Dentist cleaning", "Dentist check"]);
    expect((await dad.agent.get("/search?q=oakwood")).body.events).toHaveLength(1);
    expect((await outsider.agent.get("/search?q=dentist")).body.events).toHaveLength(0);
  });
});
