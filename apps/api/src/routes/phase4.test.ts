import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRlsBypass } from "../lib/rls";
import { mediaStorage } from "../lib/mediaStorage";
import { mailSender, type MemoryMailSender } from "../lib/mailSender";

// v3.0 Phase 4: moment category / location / date / family visibility, the
// cross-child feed and gallery, bookmarks, media details, zip downloads and
// emailed download links, ranged media reads.

async function family() {
  const app = createApp();
  const mom = await signupTestUser(app, { firstName: "Mia" });
  const leo = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2018-05-14", relationship: "MOTHER" })).body.id as string;
  // A second child directly: the free plan's child limit isn't what's under test.
  const maya = (
    await withRlsBypass((tx) =>
      tx.child.create({
        data: {
          firstName: "Maya",
          lastName: "",
          gender: "GIRL",
          birthday: new Date("2020-09-02"),
          access: { create: { userId: mom.userId, role: "PARENT", relationship: "MOTHER" } },
        },
      })
    )
  ).id;
  const dad = await signupTestUser(app, { firstName: "Dan" });
  const gran = await signupTestUser(app, { firstName: "Inger" });
  for (const childId of [leo, maya]) {
    await prisma.childAccess.create({ data: { childId, userId: dad.userId, role: "PARENT", relationship: "FATHER" } });
    await prisma.childAccess.create({ data: { childId, userId: gran.userId, role: "FAMILY", relationship: "GRANDMOTHER_MAT" } });
  }
  const outsider = await signupTestUser(app, { firstName: "Olaf" });
  return { app, leo, maya, mom, dad, gran, outsider };
}

/** A READY image/video attached to a moment, with bytes on disk. */
async function readyMedia(ownerId: string, momentId: string, type: "IMAGE" | "VIDEO" = "IMAGE", bytes = "0123456789abcdefghij") {
  const ext = type === "IMAGE" ? "jpg" : "mov";
  const original = `original/${Math.random().toString(36).slice(2)}.${ext}`;
  const derived = `derived/${Math.random().toString(36).slice(2)}.${type === "IMAGE" ? "webp" : "jpg"}`;
  await mediaStorage.save(original, Buffer.from(bytes));
  await mediaStorage.save(derived, Buffer.from("small"));
  return withRlsBypass((tx) =>
    tx.mediaAsset.create({
      data: {
        ownerId,
        momentId,
        type,
        status: "READY",
        originalPath: original,
        derivedPath: derived,
        originalBytes: bytes.length,
        derivedBytes: 5,
        durationSeconds: type === "VIDEO" ? 42.5 : null,
        codec: type === "VIDEO" ? "hevc" : null,
      },
    })
  );
}

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("Moments: category, place, date, family visibility", () => {
  beforeEach(resetDb);

  it("stores category, location, the day and visibility; the author can edit them, nobody else", async () => {
    const { mom, dad, leo } = await family();
    const created = await mom.agent.post(`/children/${leo}/moments`).send({
      title: "First Home Run",
      text: "Outfield hit!",
      categoryId: "cat_sport",
      location: "Oakwood Little League Field",
      occurredOn: "2026-10-10",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      categoryId: "cat_sport",
      location: "Oakwood Little League Field",
      occurredOn: "2026-10-10",
      familyVisible: true,
      bookmarkedByMe: false,
    });

    const edited = await mom.agent.patch(`/children/${leo}/moments/${created.body.id}`).send({ location: "Field 3", categoryId: null });
    expect(edited.body).toMatchObject({ location: "Field 3", categoryId: null });
    expect((await dad.agent.patch(`/children/${leo}/moments/${created.body.id}`).send({ title: "Mine now" })).status).toBe(403);
  });

  it("a moment hidden from family: parents see it, grandma sees neither it nor its media, not even by id", async () => {
    const { mom, dad, gran, leo } = await family();
    const hidden = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Doctor visit", familyVisible: false })).body;
    const shared = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Picnic" })).body;
    const photo = await readyMedia(mom.userId, hidden.id);

    const titles = async (agent: typeof mom.agent) => (await agent.get("/moments")).body.items.map((m: { title: string }) => m.title);
    expect(await titles(dad.agent)).toEqual(["Picnic", "Doctor visit"]);
    expect(await titles(gran.agent)).toEqual(["Picnic"]);
    expect((await gran.agent.get(`/children/${leo}/moments/${hidden.id}`)).status).toBe(404);
    expect((await gran.agent.get(`/media/${photo.id}`)).status).toBe(403);
    expect((await gran.agent.get(`/moments/media`)).body.items).toHaveLength(0);
    expect((await gran.agent.get(`/children/${leo}/moments/${hidden.id}/comments`)).status).toBe(404);
    expect((await dad.agent.get(`/children/${leo}/moments/${hidden.id}/comments`)).status).toBe(200);
    expect((await dad.agent.get(`/media/${photo.id}`)).status).toBe(200);
    expect(shared.familyVisible).toBe(true);
  });

  it("the cross-child feed filters by child, category and type", async () => {
    const { mom, leo, maya } = await family();
    const a = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Leo sport", categoryId: "cat_sport" })).body;
    await mom.agent.post(`/children/${maya}/moments`).send({ title: "Maya words only" });
    await readyMedia(mom.userId, a.id, "VIDEO");

    const titles = async (qs: string) => (await mom.agent.get(`/moments${qs}`)).body.items.map((m: { title: string }) => m.title).sort();
    expect(await titles("")).toEqual(["Leo sport", "Maya words only"]);
    expect(await titles(`?childIds=${maya}`)).toEqual(["Maya words only"]);
    expect(await titles("?categoryIds=cat_sport")).toEqual(["Leo sport"]);
    expect(await titles("?types=video")).toEqual(["Leo sport"]);
    expect(await titles("?types=text")).toEqual(["Maya words only"]);
    expect(await titles("?types=photo")).toEqual([]);

    const gallery = (await mom.agent.get("/moments/media")).body.items;
    expect(gallery).toHaveLength(1);
    expect(gallery[0]).toMatchObject({ type: "VIDEO", durationSeconds: 42.5, postTitle: "Leo sport", categoryId: "cat_sport" });
  });

  it("notify pushes to the family who can see it — parents only when hidden from family", async () => {
    const { mom, leo } = await family();
    await mom.agent.post(`/children/${leo}/moments`).send({ title: "Private", familyVisible: false, notify: true });
    // Recorded for everyone told (the push itself follows their preferences and quiet hours).
    // Sent after the response (fire-and-forget), so wait for it.
    let told: { userId: string }[] = [];
    for (let i = 0; i < 20 && told.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      told = await prisma.notification.findMany({ where: { kind: "moment.shared" }, select: { userId: true } });
    }
    expect(told).toHaveLength(1); // dad only, not grandma, not the author
  });
});

describe("Bookmarks", () => {
  beforeEach(resetDb);

  it("saves moments and media per user, is idempotent, and drops items the user can no longer see", async () => {
    const { mom, dad, gran, outsider, leo } = await family();
    const post = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Picnic" })).body;
    const photo = await readyMedia(mom.userId, post.id);

    expect((await gran.agent.post("/bookmarks").send({ momentId: post.id })).status).toBe(204);
    expect((await gran.agent.post("/bookmarks").send({ momentId: post.id })).status).toBe(204);
    expect((await gran.agent.post("/bookmarks").send({ mediaAssetId: photo.id })).status).toBe(204);
    expect((await outsider.agent.post("/bookmarks").send({ momentId: post.id })).status).toBe(404);

    const mine = (await gran.agent.get("/bookmarks")).body;
    expect(mine.moments.map((m: { id: string }) => m.id)).toEqual([post.id]);
    expect(mine.moments[0].bookmarkedByMe).toBe(true);
    expect(mine.media.map((m: { id: string }) => m.id)).toEqual([photo.id]);
    expect((await dad.agent.get("/bookmarks")).body.moments).toHaveLength(0);
    expect((await gran.agent.get("/moments")).body.items[0].bookmarkedByMe).toBe(true);

    // The author hides it from family: grandma's bookmarks no longer list it.
    await mom.agent.patch(`/children/${leo}/moments/${post.id}`).send({ familyVisible: false });
    expect((await gran.agent.get("/bookmarks")).body).toEqual({ moments: [], media: [] });

    expect((await dad.agent.post("/bookmarks").send({ momentId: post.id })).status).toBe(204);
    expect((await dad.agent.delete(`/bookmarks?momentId=${post.id}`)).status).toBe(204);
    expect((await dad.agent.get("/bookmarks")).body.moments).toHaveLength(0);
  });
});

describe("Media: details, ranges, downloads", () => {
  beforeEach(resetDb);

  it("details carry the moment, sizes, codec and position", async () => {
    const { mom, dad, leo } = await family();
    const post = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Home run", location: "Field 3", categoryId: "cat_sport" })).body;
    const first = await readyMedia(mom.userId, post.id);
    const video = await readyMedia(mom.userId, post.id, "VIDEO");
    const info = (await dad.agent.get(`/media/${video.id}/info`)).body;
    expect(info).toMatchObject({
      type: "VIDEO",
      codec: "hevc",
      originalBytes: 20,
      moment: { id: post.id, title: "Home run", location: "Field 3", categoryId: "cat_sport", index: 1, mediaIds: [first.id, video.id] },
    });
  });

  it("honours a byte range (video seeking)", async () => {
    const { mom, leo } = await family();
    const post = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Clip" })).body;
    const video = await readyMedia(mom.userId, post.id, "VIDEO");
    const res = await mom.agent.get(`/media/${video.id}?variant=original`).set("Range", "bytes=2-5").buffer(true).parse(binary);
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 2-5/20");
    expect(res.body.toString()).toBe("2345");
  });

  it("zips the chosen files for the device, checking access to every one", async () => {
    const { mom, dad, outsider, leo } = await family();
    const post = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Picnic" })).body;
    const a = await readyMedia(mom.userId, post.id);
    const b = await readyMedia(mom.userId, post.id);

    const zip = await dad.agent.post("/media/archive").send({ mediaIds: [a.id, b.id], variant: "original" }).buffer(true).parse(binary);
    expect(zip.status).toBe(200);
    expect(zip.headers["content-type"]).toBe("application/zip");
    expect(zip.body.subarray(0, 2).toString()).toBe("PK");
    expect(zip.body.includes(Buffer.from("picnic-2.jpg"))).toBe(true);

    // Outsiders get 404: RLS hides the asset entirely, so its existence never leaks.
    expect((await outsider.agent.post("/media/archive").send({ mediaIds: [a.id], variant: "original" })).status).toBe(404);
    expect((await dad.agent.post("/media/archive").send({ mediaIds: [], variant: "original" })).status).toBe(400);
    const viaGet = await dad.agent.get(`/media/archive?ids=${a.id},${b.id}&variant=optimized`).buffer(true).parse(binary);
    expect(viaGet.status).toBe(200);
    expect(viaGet.body.subarray(0, 2).toString()).toBe("PK");
  });

  it("emails a 7-day link that serves the zip to its owner only", async () => {
    const { mom, dad, leo } = await family();
    const post = (await mom.agent.post(`/children/${leo}/moments`).send({ title: "Picnic" })).body;
    const a = await readyMedia(mom.userId, post.id);
    const sender = mailSender as MemoryMailSender;
    const seen = sender.sent.length;

    expect((await dad.agent.post("/media/archive/email").send({ mediaIds: [a.id], variant: "optimized" })).status).toBe(204);
    const mail = sender.sent.slice(seen).find((m) => m.subject.includes("download is ready"));
    const token = mail?.text.match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();

    const own = await dad.agent.get(`/media/archive/${token}`).buffer(true).parse(binary);
    expect(own.status).toBe(200);
    expect(own.body.subarray(0, 2).toString()).toBe("PK");
    expect((await mom.agent.get(`/media/archive/${token}`)).status).toBe(404);

    await withRlsBypass((tx) => tx.mediaDownloadLink.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } }));
    expect((await dad.agent.get(`/media/archive/${token}`)).body.code).toBe("DOWNLOAD_LINK_EXPIRED");
  });
});
