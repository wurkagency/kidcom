import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRls } from "./rls";

// v2.0 RLS pilot (plan §3.2) proof — MedicalInfo and JournalPost, the two
// highest-sensitivity tables per the plan. These tests go through
// withRls() directly rather than HTTP routes, deliberately bypassing
// requireChildAccess/requireCapability entirely — the whole point of RLS as
// a second, independent layer is that it must hold even when the app-layer
// check is absent or buggy, not just when it's present and working.
async function twoParentsTwoChildren() {
  const app = createApp();
  const { userId: parentA } = await signupTestUser(app, { email: "rls-parent-a@example.com" });
  const { userId: parentB } = await signupTestUser(app, { email: "rls-parent-b@example.com" });

  const childA = await prisma.child.create({
    data: { firstName: "ChildA", lastName: "Test", gender: "BOY", birthday: new Date("2020-01-01") },
  });
  const childB = await prisma.child.create({
    data: { firstName: "ChildB", lastName: "Test", gender: "GIRL", birthday: new Date("2020-01-01") },
  });
  await prisma.childAccess.create({
    data: { childId: childA.id, userId: parentA, role: "PARENT", relationship: "PARENT" },
  });
  await prisma.childAccess.create({
    data: { childId: childB.id, userId: parentB, role: "PARENT", relationship: "PARENT" },
  });

  return { parentA, parentB, childA: childA.id, childB: childB.id };
}

describe("RLS pilot — medical_info / journal_posts, app-layer check deliberately absent", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a user with no ChildAccess to a child gets zero medical_info rows back, not an error and not the real rows", async () => {
    const { parentA, parentB, childA } = await twoParentsTwoChildren();

    await withRls(parentA, (tx) =>
      tx.medicalInfo.create({
        data: { childId: childA, category: "ALLERGY", condition: "peanuts" },
      })
    );

    // Sanity: the legitimate owner sees it.
    const ownRead = await withRls(parentA, (tx) => tx.medicalInfo.findMany({ where: { childId: childA } }));
    expect(ownRead).toHaveLength(1);

    // parentB has zero ChildAccess rows for childA — no requireChildAccess
    // call happens anywhere in this test, only the DB layer is exercised.
    const intruderRead = await withRls(parentB, (tx) => tx.medicalInfo.findMany({ where: { childId: childA } }));
    expect(intruderRead).toHaveLength(0);
  });

  it("a user with no ChildAccess cannot insert a medical_info row for someone else's child", async () => {
    const { parentB, childA } = await twoParentsTwoChildren();

    await expect(
      withRls(parentB, (tx) => tx.medicalInfo.create({ data: { childId: childA, category: "CONDITION", condition: "asthma" } }))
    ).rejects.toThrow(/row-level security/i);

    const rows = await withRls(parentB, (tx) => tx.medicalInfo.findMany({ where: { childId: childA } }));
    expect(rows).toHaveLength(0);
  });

  it("a user with no ChildAccess to any tagged child gets zero journal_posts rows back", async () => {
    const app = createApp();
    const { agent, userId: parentA } = await signupTestUser(app, { email: "rls-jp-author@example.com" });
    const childRes = await agent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;
    const postRes = await agent.post(`/children/${childId}/journal`).send({ title: "First steps" });
    expect(postRes.status).toBe(201);

    const { userId: outsider } = await signupTestUser(app, { email: "rls-jp-outsider@example.com" });
    const outsiderRead = await withRls(outsider, (tx) => tx.journalPost.findMany({ where: { id: postRes.body.id } }));
    expect(outsiderRead).toHaveLength(0);

    // Confirmed via the real author's own session too, for contrast.
    const authorRead = await withRls(parentA, (tx) => tx.journalPost.findMany({ where: { id: postRes.body.id } }));
    expect(authorRead).toHaveLength(1);
  });

  it("revoking ChildAccess mid-session blocks the very next medical_info read — no caching, no lingering grant", async () => {
    const { parentA, childA } = await twoParentsTwoChildren();
    await withRls(parentA, (tx) => tx.medicalInfo.create({ data: { childId: childA, category: "ALLERGY", condition: "bees" } }));

    expect(await withRls(parentA, (tx) => tx.medicalInfo.findMany({ where: { childId: childA } }))).toHaveLength(1);

    await prisma.childAccess.deleteMany({ where: { childId: childA, userId: parentA } });

    expect(await withRls(parentA, (tx) => tx.medicalInfo.findMany({ where: { childId: childA } }))).toHaveLength(0);
  });
});

// The prototype in rls.test.ts validates the SET LOCAL / pooled-connection
// mechanism in isolation, with no real table or policy involved. This
// repeats the same interleaved-concurrency shape against the actual
// RLS-protected medical_info table, to prove the mechanism and the policy
// compose correctly together — not just each in isolation.
describe("RLS pilot — interleaved concurrent requests against the real medical_info table", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("many concurrent requests as different users each only ever see their own child's medical info", async () => {
    const app = createApp();
    const users = await Promise.all(
      Array.from({ length: 8 }, (_, i) => signupTestUser(app, { email: `rls-concurrent-${i}@example.com` }))
    );

    const setups = await Promise.all(
      users.map(async ({ userId }, i) => {
        const child = await prisma.child.create({
          data: { firstName: `Kid${i}`, lastName: "Test", gender: "BOY", birthday: new Date("2020-01-01") },
        });
        await prisma.childAccess.create({
          data: { childId: child.id, userId, role: "PARENT", relationship: "PARENT" },
        });
        await withRls(userId, (tx) =>
          tx.medicalInfo.create({ data: { childId: child.id, category: "ALLERGY", condition: `condition-${i}` } })
        );
        return { userId, childId: child.id, expected: `condition-${i}` };
      })
    );

    const results = await Promise.all(
      setups.map(async ({ userId, childId }) => {
        await new Promise((r) => setTimeout(r, Math.random() * 15));
        const rows = await withRls(userId, (tx) => tx.medicalInfo.findMany({ where: { childId } }));
        return rows.map((r) => r.condition);
      })
    );

    results.forEach((conditions, i) => {
      expect(conditions).toEqual([setups[i].expected]);
    });
  });
});
