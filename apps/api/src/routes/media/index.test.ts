import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser } from "../../testUtils/auth";
import { mediaStorage } from "../../lib/mediaStorage";
import { withRls } from "../../lib/rls";

// v2.0 Phase 5 — media-auth proof, replacing the brief's originally-planned
// Nginx auth_request wiring (Charlie's call: GET /media/:id was already a
// live, per-request, session+ChildAccess-checked gate before this branch —
// there's no signed-URL/static-file bypass to close). This is the first
// test coverage this route has ever had. Proves the two things that
// actually matter: revoking access blocks the very next request (no
// caching, no independent expiry window to wait out), and a user who never
// had access is denied too.
async function createReadyImageAsset(_childId: string, ownerId: string, journalPostId: string) {
  const key = `original/${Math.random().toString(36).slice(2)}.jpg`;
  await mediaStorage.save(key, Buffer.from("not a real jpeg, just needs to exist on disk"));
  return withRls(ownerId, (tx) =>
    tx.mediaAsset.create({
      data: { ownerId, type: "IMAGE", status: "READY", originalPath: key, derivedPath: key, journalPostId },
    })
  );
}

describe("GET /media/:id — revocation and outsider denial (v2.0 Phase 5)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("revoking a member's ChildAccess blocks their very next GET /media/:id — no delay, no lingering grant", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "media-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const { agent: familyAgent, userId: familyId } = await signupTestUser(app, { email: "media-family@example.com" });
    await prisma.childAccess.create({
      data: { childId, userId: familyId, role: "FAMILY", relationship: "GRANDMOTHER_MAT" },
    });

    const post = await withRls(parentId, async (tx) => {
      const created = await tx.journalPost.create({ data: { authorId: parentId, title: "Beach day" } });
      await tx.journalPostChild.create({ data: { journalPostId: created.id, childId } });
      return created;
    });
    const asset = await createReadyImageAsset(childId, parentId, post.id);

    const beforeRes = await familyAgent.get(`/media/${asset.id}`);
    expect(beforeRes.status).toBe(200);

    await prisma.childAccess.deleteMany({ where: { childId, userId: familyId } });

    const afterRes = await familyAgent.get(`/media/${asset.id}`);
    expect(afterRes.status).not.toBe(200);
    expect([403, 404]).toContain(afterRes.status);
  });

  it("a user who never had access to the child is denied, even holding a real, otherwise-valid media id", async () => {
    const app = createApp();
    const { userId: parentId } = await signupTestUser(app, { email: "media-owner@example.com" });
    const childRes = await prisma.child.create({
      data: { firstName: "Kid", lastName: "Test", gender: "BOY", birthday: new Date("2020-01-01") },
    });
    await prisma.childAccess.create({ data: { childId: childRes.id, userId: parentId, role: "PARENT", relationship: "PARENT" } });

    const post = await withRls(parentId, async (tx) => {
      const created = await tx.journalPost.create({ data: { authorId: parentId, title: "Private moment" } });
      await tx.journalPostChild.create({ data: { journalPostId: created.id, childId: childRes.id } });
      return created;
    });
    const asset = await createReadyImageAsset(childRes.id, parentId, post.id);

    const { agent: outsiderAgent } = await signupTestUser(app, { email: "media-outsider@example.com" });
    const res = await outsiderAgent.get(`/media/${asset.id}`);
    expect(res.status).not.toBe(200);
    expect([403, 404]).toContain(res.status);
  });

  it("the owner of a freshly uploaded, not-yet-attached asset can read it back; a stranger cannot", async () => {
    const app = createApp();
    const { agent: ownerAgent, userId: ownerId } = await signupTestUser(app, { email: "media-fresh-owner@example.com" });
    const key = `original/${Math.random().toString(36).slice(2)}.jpg`;
    await mediaStorage.save(key, Buffer.from("fresh upload"));
    const asset = await withRls(ownerId, (tx) =>
      tx.mediaAsset.create({
        data: { ownerId, type: "IMAGE", status: "READY", originalPath: key, derivedPath: key },
      })
    );

    const ownRes = await ownerAgent.get(`/media/${asset.id}`);
    expect(ownRes.status).toBe(200);

    const { agent: strangerAgent } = await signupTestUser(app, { email: "media-fresh-stranger@example.com" });
    const strangerRes = await strangerAgent.get(`/media/${asset.id}`);
    expect(strangerRes.status).not.toBe(200);
  });
});
