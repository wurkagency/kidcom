import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { purgeExpiredDeletedChildren } from "./childPurge";
import { RESTORE_WINDOW_DAYS } from "../routes/children/deletion";

// Post-launch backlog Phase H proof — GDPR retention follow-through: a
// child soft-deleted more than RESTORE_WINDOW_DAYS ago is actually gone
// (hard-deleted) once this runs; one still inside the window is untouched.
describe("purgeExpiredDeletedChildren (Phase H)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("hard-deletes a child soft-deleted past the restore window", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "purge-expired@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;
    await agent.post(`/children/${childId}/delete-request`).send({});

    await prisma.child.update({
      where: { id: childId },
      data: { deletedAt: new Date(Date.now() - (RESTORE_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000) },
    });

    const result = await purgeExpiredDeletedChildren();
    expect(result.purged).toBe(1);
    expect(await prisma.child.findUnique({ where: { id: childId } })).toBeNull();
  });

  it("leaves a child soft-deleted within the restore window untouched", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "purge-fresh@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Kid", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;
    await agent.post(`/children/${childId}/delete-request`).send({});
    // deletedAt is "now" from the delete-request above — well within the window.

    const result = await purgeExpiredDeletedChildren();
    expect(result.purged).toBe(0);
    expect(await prisma.child.findUnique({ where: { id: childId } })).not.toBeNull();
  });

  it("never touches a child that was never deleted at all", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "purge-notdeleted@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });

    const result = await purgeExpiredDeletedChildren();
    expect(result.purged).toBe(0);
    expect(await prisma.child.findUnique({ where: { id: childRes.body.id } })).not.toBeNull();
  });
});
