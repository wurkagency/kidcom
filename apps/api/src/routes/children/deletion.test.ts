import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { prisma } from "../../db";
import { resetDb } from "../../testUtils/db";
import { signupTestUser, verifyTestUserEmail } from "../../testUtils/auth";

// Phase 10 proof — spec 9.21/§1.4a.4: soft delete, 30-day restore, all-
// PARENT-confirm with GUARDIAN-fallback-if-none.
describe("Child soft delete (spec 9.21)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a lone parent's delete-request executes immediately (nothing to wait on)", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "solo-parent@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Milo", gender: "BOY", birthday: "2021-01-01" });
    const childId = childRes.body.id;

    const delRes = await agent.post(`/children/${childId}/delete-request`).send({});
    expect(delRes.status).toBe(201);
    expect(delRes.body.executed).toBe(true);

    const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    expect(child.deletedAt).not.toBeNull();

    // Dropped from the normal list immediately.
    const listRes = await agent.get("/children");
    expect(listRes.body.children.map((c: { id: string }) => c.id)).not.toContain(childId);
  });

  it("two parents must both confirm before the child is actually deleted", async () => {
    const app = createApp();
    const { agent: parentA } = await signupTestUser(app, { email: "parent-a@example.com" });
    const childRes = await parentA
      .post("/children")
      .send({ firstName: "Ida", gender: "GIRL", birthday: "2020-01-01", relationship: "MOTHER" });
    const childId = childRes.body.id;

    const inviteRes = await parentA.post("/invites").send({ childId, relationship: "FATHER", email: "parent-b@example.com" });
    const parentBAgent = request.agent(app);
    const acceptRes = await parentBAgent
      .post(`/invites/${inviteRes.body.token}/accept`)
      .send({ firstName: "Parent", lastName: "B", password: "password123" });
    await verifyTestUserEmail(parentBAgent, "parent-b@example.com");
    void acceptRes;

    const requestRes = await parentA.post(`/children/${childId}/delete-request`).send({});
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.executed).toBe(false);
    expect(requestRes.body.request.confirmedUserIds).toHaveLength(1);
    expect(requestRes.body.request.requiredUserIds).toHaveLength(2);

    // Not deleted yet — only one of two parents has confirmed.
    const stillThere = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    expect(stillThere.deletedAt).toBeNull();

    // A grandmother invited onto the child is not a required confirmer and
    // cannot short-circuit the vote.
    const grandmaInvite = await parentA.post("/invites").send({ childId, relationship: "GRANDMOTHER_MAT", email: "grandma6@example.com" });
    const grandmaAgent = request.agent(app);
    await grandmaAgent.post(`/invites/${grandmaInvite.body.token}/accept`).send({ firstName: "Grandma", lastName: "Six", password: "password123" });
    await verifyTestUserEmail(grandmaAgent, "grandma6@example.com");
    const grandmaConfirm = await grandmaAgent.post(`/children/${childId}/delete-request/confirm`).send({});
    expect(grandmaConfirm.status).toBe(403);

    const confirmRes = await parentBAgent.post(`/children/${childId}/delete-request/confirm`).send({});
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.executed).toBe(true);

    const deleted = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(await prisma.childDeletionRequest.findUnique({ where: { childId } })).toBeNull();
  });

  it("a bootstrap-guardian child with zero parents lets the sole guardian delete alone", async () => {
    const app = createApp();
    const { agent: grandmaAgent } = await signupTestUser(app, { email: "grandma-del@example.com" });
    const childRes = await grandmaAgent.post("/children").send({
      firstName: "Zoe",
      gender: "GIRL",
      birthday: "2023-01-01",
      relationship: "GRANDMOTHER_MAT",
      parentContact: { name: "Zoe's Mom", wantsClaimLink: true },
    });
    const childId = childRes.body.id;

    const delRes = await grandmaAgent.post(`/children/${childId}/delete-request`).send({});
    expect(delRes.status).toBe(201);
    expect(delRes.body.executed).toBe(true);
  });

  it("cancelling a pending request clears it without deleting the child", async () => {
    const app = createApp();
    const { agent: parentA } = await signupTestUser(app, { email: "cancel-a@example.com" });
    const childRes = await parentA.post("/children").send({ firstName: "Sam", gender: "BOY", birthday: "2020-01-01", relationship: "FATHER" });
    const childId = childRes.body.id;
    const inviteRes = await parentA.post("/invites").send({ childId, relationship: "MOTHER", email: "cancel-b@example.com" });
    const parentBAgent = request.agent(app);
    await parentBAgent.post(`/invites/${inviteRes.body.token}/accept`).send({ firstName: "Cancel", lastName: "B", password: "password123" });
    await verifyTestUserEmail(parentBAgent, "cancel-b@example.com");

    await parentA.post(`/children/${childId}/delete-request`).send({});
    const cancelRes = await parentA.delete(`/children/${childId}/delete-request`);
    expect(cancelRes.status).toBe(204);

    expect(await prisma.childDeletionRequest.findUnique({ where: { childId } })).toBeNull();
    const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    expect(child.deletedAt).toBeNull();
  });

  it("restore within the 30-day window undoes the deletion; past the window it's refused", async () => {
    const app = createApp();
    const { agent } = await signupTestUser(app, { email: "restore-test@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Wren", gender: "GIRL", birthday: "2019-01-01" });
    const childId = childRes.body.id;
    await agent.post(`/children/${childId}/delete-request`).send({});

    const restoreRes = await agent.post(`/children/${childId}/restore`);
    expect(restoreRes.status).toBe(200);
    const restored = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    expect(restored.deletedAt).toBeNull();
    const listRes = await agent.get("/children");
    expect(listRes.body.children.map((c: { id: string }) => c.id)).toContain(childId);

    // Delete again, then simulate the window having passed.
    await agent.post(`/children/${childId}/delete-request`).send({});
    await prisma.child.update({ where: { id: childId }, data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
    const lateRestoreRes = await agent.post(`/children/${childId}/restore`);
    expect(lateRestoreRes.status).toBe(410);
  });

  // spec 9.21 — "this is conditional capability, which §1.4 otherwise warns
  // against — but the gaming path is closed, since a guardian cannot remove
  // a parent to create the condition." Proving that invariant holds
  // specifically in this context: a guardian can never engineer the
  // zero-parent state that would let her alone confirm a deletion.
  it("gaming path closed: a guardian cannot remove the last parent to unlock solo-guardian deletion", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "gaming-parent@example.com" });
    const childRes = await parentAgent
      .post("/children")
      .send({ firstName: "Theo", gender: "BOY", birthday: "2020-01-01", relationship: "FATHER" });
    const childId = childRes.body.id;

    const guardianInvite = await parentAgent.post("/invites").send({ childId, relationship: "GUARDIAN", email: "gaming-guardian@example.com" });
    const guardianAgent = request.agent(app);
    await guardianAgent.post(`/invites/${guardianInvite.body.token}/accept`).send({ firstName: "Gaming", lastName: "Guardian", password: "password123" });
    await verifyTestUserEmail(guardianAgent, "gaming-guardian@example.com");

    // The guardian tries to remove the only parent — denied outright,
    // regardless of parent count (member:invite_or_remove_parent is
    // PARENT-only, not just "not the last one").
    const removeAttempt = await guardianAgent.delete(`/children/${childId}/family/${parentId}`);
    expect(removeAttempt.status).toBe(403);

    // The parent is still there, so required confirmers is [parentId] only
    // — the guardian was never a candidate to begin with, and (having just
    // failed to remove the parent) never can be.
    const guardianDeleteAttempt = await guardianAgent.post(`/children/${childId}/delete-request`).send({});
    expect(guardianDeleteAttempt.status).toBe(403);

    const statusRes = await parentAgent.get(`/children/${childId}/delete-request`);
    expect(statusRes.body.request).toBeNull();

    // Confirming the invariant directly: the parent alone is the required
    // set, so the parent alone can execute the deletion.
    const parentDeleteRes = await parentAgent.post(`/children/${childId}/delete-request`).send({});
    expect(parentDeleteRes.status).toBe(201);
    expect(parentDeleteRes.body.executed).toBe(true);
  });
});
