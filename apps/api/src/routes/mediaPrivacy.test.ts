import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import fsp from "node:fs/promises";
import sharp from "sharp";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRlsBypass } from "../lib/rls";
import { mediaStorage } from "../lib/mediaStorage";
import { mailSender, type MemoryMailSender } from "../lib/mailSender";
import { processImage, processedColumns } from "../lib/mediaProcessing";

// Media privacy: files are encrypted on disk, the uploader keeps their
// original while everyone else gets it without location, capture data and
// upload origin are stored but never sent to clients, and sign-ins are logged.

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const locatedJpeg = () =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: "#8fafa2" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15 Pro" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "55/1 40/1 3396/100", GPSLongitudeRef: "E", GPSLongitude: "12/1 34/1 5988/100" },
    })
    .toBuffer();

async function family() {
  const app = createApp();
  const mom = await signupTestUser(app, { firstName: "Mia" });
  const leo = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2018-05-14", relationship: "MOTHER" })).body.id as string;
  const dad = await signupTestUser(app, { firstName: "Dan" });
  await prisma.childAccess.create({ data: { childId: leo, userId: dad.userId, role: "PARENT", relationship: "FATHER" } });
  return { app, leo, mom, dad };
}

/** Mom uploads a located photo through the real endpoint, posts it, and the worker step runs. */
async function postLocatedPhoto(f: Awaited<ReturnType<typeof family>>) {
  const upload = await f.mom.agent.post("/media/upload").set("User-Agent", "KidComTest/1.0 (iPhone)").attach("file", await locatedJpeg(), { filename: "home.jpg", contentType: "image/jpeg" });
  expect(upload.status).toBe(201);
  const id = upload.body.id as string;
  await f.mom.agent.post(`/children/${f.leo}/moments`).send({ title: "Garden", mediaAssetIds: [id] });
  return id;
}

async function runWorker(id: string) {
  const asset = await withRlsBypass((tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id } }));
  const result = await processImage(asset);
  await withRlsBypass((tx) => tx.mediaAsset.update({ where: { id }, data: processedColumns(result) }));
}

describe("Media privacy", () => {
  beforeEach(resetDb);

  it("stores uploads encrypted, with where they came from", async () => {
    const f = await family();
    const id = await postLocatedPhoto(f);
    const row = await withRlsBypass((tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id } }));
    expect(row.uploadUserAgent).toBe("KidComTest/1.0 (iPhone)");
    expect(row.uploadIp).toBeTruthy();
    const onDisk = await fsp.readFile(mediaStorage.pathFor(row.originalPath));
    expect(onDisk.subarray(0, 4).toString()).toBe("KCM1");
  });

  it("others can't have a file before it has been checked for location", async () => {
    const f = await family();
    const id = await postLocatedPhoto(f);
    expect((await f.dad.agent.get(`/media/${id}?variant=source`)).body.code).toBe("MEDIA_PROCESSING");
    expect((await f.mom.agent.get(`/media/${id}?variant=source`)).status).toBe(200);
  });

  it("the uploader downloads the original with its location; everyone else gets it without", async () => {
    const f = await family();
    const id = await postLocatedPhoto(f);
    await runWorker(id);

    const row = await withRlsBypass((tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id } }));
    expect(row.capturedLatitude).toBeCloseTo(55.6761, 3);
    expect(row).toMatchObject({ deviceMake: "Apple", deviceModel: "iPhone 15 Pro" });

    const gps = async (buf: Buffer) => ((await import("exifr")).default.gps(buf) as Promise<{ latitude?: number } | undefined>);
    const mine = await f.mom.agent.get(`/media/${id}?variant=source`).buffer(true).parse(binary);
    const theirs = await f.dad.agent.get(`/media/${id}?variant=source`).buffer(true).parse(binary);
    expect((await gps(mine.body))?.latitude).toBeCloseTo(55.6761, 3);
    expect((await gps(theirs.body))?.latitude).toBeUndefined();

    const zip = await f.dad.agent.get(`/media/archive?ids=${id}&variant=original`).buffer(true).parse(binary);
    expect(zip.body.subarray(0, 2).toString()).toBe("PK");
    expect(zip.body.includes(Buffer.from("iPhone 15 Pro"))).toBe(true); // the device is kept…
    expect(await gps(mine.body)).toBeTruthy();
    // …and the dad's zip entry is the stripped copy: same bytes as his direct download.
    expect(zip.body.includes(theirs.body.subarray(100, 400))).toBe(true);
  });

  it("capture data and upload origin never reach the app", async () => {
    const f = await family();
    const id = await postLocatedPhoto(f);
    await runWorker(id);
    const bodies = [
      (await f.dad.agent.get(`/media/${id}/info`)).text,
      (await f.dad.agent.get("/moments/media")).text,
      (await f.dad.agent.get("/moments")).text,
      (await f.mom.agent.get(`/media/${id}/info`)).text,
    ];
    for (const b of bodies) expect(b).not.toMatch(/captured|latitude|longitude|uploadIp|userAgent|deviceM/i);
  });
});

describe("Login events", () => {
  beforeEach(resetDb);

  it("records sign-ups, failed passwords and completed sign-ins with IP and user agent", async () => {
    const app = createApp();
    const { email, userId } = await signupTestUser(app);
    const agent = request.agent(app);
    await agent.post("/auth/login").set("User-Agent", "Browser/9").send({ email, password: "wrong-password1" });
    await agent.post("/auth/login").set("User-Agent", "Browser/9").send({ email: "nobody@example.com", password: "x1234567" });
    await agent.post("/auth/login").set("User-Agent", "Browser/9").send({ email, password: "password123" });
    const mail = [...(mailSender as MemoryMailSender).sent].reverse().find((m) => m.to === email);
    await agent.post("/auth/verify-2fa").set("User-Agent", "Browser/9").send({ code: mail!.text.match(/\b(\d{6})\b/)![1] });

    const events = await withRlsBypass((tx) => tx.loginEvent.findMany({ orderBy: { createdAt: "asc" } }));
    expect(events.map((e) => [e.method, e.outcome, e.userId === userId, e.email])).toEqual([
      ["SIGNUP", "SUCCESS", true, null],
      ["PASSWORD", "FAILED", true, email],
      ["PASSWORD", "FAILED", false, "nobody@example.com"],
      ["TWO_FACTOR", "SUCCESS", true, null],
    ]);
    expect(events.slice(1).every((e) => e.userAgent === "Browser/9" && e.ip)).toBe(true);
    // Users can't read other people's events through RLS.
    const other = await signupTestUser(app);
    const visible = await (await import("../lib/rls")).withRls(other.userId, (tx) => tx.loginEvent.findMany({ where: { userId } }));
    expect(visible).toHaveLength(0);
  });
});
