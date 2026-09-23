import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRlsBypass } from "../lib/rls";
import { processImage, processedColumns } from "../lib/mediaProcessing";

// v3.0 Phase 5: lists across children with due dates and "I'll get it"
// claims with notes; children list with the caller's role; cover photos.

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

describe("Lists", () => {
  beforeEach(resetDb);

  it("lists across children, open items soonest-due first, filtered by type", async () => {
    const { mom, dad, leo } = await family();
    await mom.agent.post(`/children/${leo}/lists`).send({ type: "NECESSITY", title: "Rain boots", sizeValue: "41" });
    await mom.agent.post(`/children/${leo}/lists`).send({ type: "NECESSITY", title: "Soccer shoes", dueOn: "2026-09-26" });
    await mom.agent.post(`/children/${leo}/lists`).send({ type: "WISHLIST", title: "Lego" });

    const res = await dad.agent.get("/lists?type=NECESSITY");
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(["Soccer shoes", "Rain boots"]);
    expect(res.body.items[0]).toMatchObject({ dueOn: "2026-09-26", claimedById: null, claimNote: null });
    expect((await dad.agent.get(`/lists?type=WISHLIST&childIds=${leo}`)).body.items).toHaveLength(1);
    expect((await dad.agent.get("/lists?childIds=someone-else")).body.items).toHaveLength(0);
  });

  it("I'll get it: claim with a note, edit the note, and others can't take it over", async () => {
    const { mom, gran, dad, leo } = await family();
    const item = (await mom.agent.post(`/children/${leo}/lists`).send({ type: "NECESSITY", title: "Rain boots" })).body;

    const claimed = await gran.agent.patch(`/children/${leo}/lists/${item.id}/claim`).send({ claimed: true, note: "Bought at Magasin, size 28." });
    expect(claimed.body).toMatchObject({ claimedById: gran.userId, claimNote: "Bought at Magasin, size 28." });
    expect(claimed.body.claimedAt).toBeTruthy();

    const renoted = await gran.agent.patch(`/children/${leo}/lists/${item.id}/claim`).send({ note: "Will bring it Friday." });
    expect(renoted.body).toMatchObject({ claimedById: gran.userId, claimNote: "Will bring it Friday.", claimedAt: claimed.body.claimedAt });

    const taken = await dad.agent.patch(`/children/${leo}/lists/${item.id}/claim`).send({ claimed: true });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("ALREADY_CLAIMED");

    const released = await gran.agent.patch(`/children/${leo}/lists/${item.id}/claim`).send({ claimed: false });
    expect(released.body).toMatchObject({ claimedById: null, claimNote: null, claimedAt: null });
  });

  it("due dates can be set and cleared", async () => {
    const { mom, leo } = await family();
    const item = (await mom.agent.post(`/children/${leo}/lists`).send({ type: "NECESSITY", title: "Swimsuit", dueOn: "2026-10-22" })).body;
    expect(item.dueOn).toBe("2026-10-22");
    expect((await mom.agent.patch(`/children/${leo}/lists/${item.id}`).send({ dueOn: null })).body.dueOn).toBeNull();
    expect((await mom.agent.patch(`/children/${leo}/lists/${item.id}`).send({ dueOn: "22-10-2026" })).status).toBe(400);
  });
});

describe("Children", () => {
  beforeEach(resetDb);

  it("tells each person their own role, and whether they may edit", async () => {
    const { mom, gran } = await family();
    expect((await mom.agent.get("/children")).body.children[0]).toMatchObject({ myRole: "PARENT", myRelationship: "MOTHER", canEdit: true });
    expect((await gran.agent.get("/children")).body.children[0]).toMatchObject({ myRole: "FAMILY", myRelationship: "GRANDMOTHER_MAT", canEdit: false });
  });

  it("a cover photo is visible to the family, not to outsiders", async () => {
    const { mom, gran, outsider, leo } = await family();
    const photo = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#e2efea" } }).png().toBuffer();
    const upload = await mom.agent.post("/media/upload").attach("file", photo, { filename: "cover.png", contentType: "image/png" });
    const patched = await mom.agent.patch(`/children/${leo}`).send({ coverImageMediaAssetId: upload.body.id });
    expect(patched.body.coverImageUrl).toBe(upload.body.id);
    // Others can have it once the worker has checked it for location.
    const asset = await withRlsBypass((tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id: upload.body.id } }));
    const done = await processImage(asset);
    await withRlsBypass((tx) => tx.mediaAsset.update({ where: { id: asset.id }, data: processedColumns(done) }));

    expect((await gran.agent.get(`/media/${upload.body.id}`)).status).toBe(200);
    expect((await outsider.agent.get(`/media/${upload.body.id}`)).status).toBe(404);
    expect((await gran.agent.get("/children")).body.children[0].coverImageUrl).toBe(upload.body.id);
  });
});
