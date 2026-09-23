import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRls } from "./rls";

// v2.0 Phase 5 — spot-checks the full RLS rollout across a representative
// sample of the newly-protected tables (a direct-childId one, and a
// two-hop-transitive one), the same "app-layer check deliberately absent"
// shape as rls.medicalInfoMoment.test.ts's Phase 4 proof. Not
// exhaustive over every one of the ~13 tables the migration touches — the
// policies all share one of two predicate shapes (direct childId, or
// transitive via journal_post_children), already proven correct by the
// Phase 4 tests plus every existing route test passing unchanged; this
// exists to confirm the rollout migration itself was actually applied and
// wired correctly, not to re-prove the mechanism.
async function twoParentsTwoChildren() {
  const app = createApp();
  const { userId: parentA } = await signupTestUser(app, { email: "rls5-parent-a@example.com" });
  const { userId: parentB } = await signupTestUser(app, { email: "rls5-parent-b@example.com" });

  const childA = await prisma.child.create({
    data: { firstName: "ChildA", lastName: "Test", gender: "BOY", birthday: new Date("2020-01-01") },
  });
  await prisma.childAccess.create({ data: { childId: childA.id, userId: parentA, role: "PARENT", relationship: "PARENT" } });
  await prisma.childAccess.create({
    data: {
      childId: (await prisma.child.create({ data: { firstName: "ChildB", lastName: "Test", gender: "GIRL", birthday: new Date("2020-01-01") } })).id,
      userId: parentB,
      role: "PARENT",
      relationship: "PARENT",
    },
  });

  return { parentA, parentB, childAId: childA.id };
}

describe("RLS full rollout — direct-childId table (calendar_events)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an outsider gets zero calendar_events rows for a child they have no ChildAccess to", async () => {
    const { parentA, parentB, childAId } = await twoParentsTwoChildren();
    await withRls(parentA, (tx) =>
      tx.calendarEvent.create({
        data: { childId: childAId, categoryId: "cat_appointment", title: "Dentist", startsAt: new Date("2026-01-01") },
      })
    );

    expect(await withRls(parentA, (tx) => tx.calendarEvent.findMany({ where: { childId: childAId } }))).toHaveLength(1);
    expect(await withRls(parentB, (tx) => tx.calendarEvent.findMany({ where: { childId: childAId } }))).toHaveLength(0);
  });
});

describe("RLS full rollout — direct-childId table (list_items)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an outsider gets zero list_items rows and cannot insert one for someone else's child", async () => {
    const { parentA, parentB, childAId } = await twoParentsTwoChildren();
    await withRls(parentA, (tx) => tx.listItem.create({ data: { childId: childAId, type: "NECESSITY", title: "Diapers" } }));

    expect(await withRls(parentB, (tx) => tx.listItem.findMany({ where: { childId: childAId } }))).toHaveLength(0);
    await expect(
      withRls(parentB, (tx) => tx.listItem.create({ data: { childId: childAId, type: "NECESSITY", title: "Sneaking in" } }))
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("RLS full rollout — transitive-via-journal_post_children table (comments)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an outsider gets zero comment rows on a moment about a child they have no access to", async () => {
    const { parentA, parentB, childAId } = await twoParentsTwoChildren();
    const post = await withRls(parentA, async (tx) => {
      const created = await tx.moment.create({ data: { authorId: parentA, title: "Milestone" } });
      await tx.momentChild.create({ data: { momentId: created.id, childId: childAId } });
      await tx.comment.create({ data: { momentId: created.id, authorId: parentA, text: "Wonderful!" } });
      return created;
    });

    expect(await withRls(parentA, (tx) => tx.comment.findMany({ where: { momentId: post.id } }))).toHaveLength(1);
    expect(await withRls(parentB, (tx) => tx.comment.findMany({ where: { momentId: post.id } }))).toHaveLength(0);
  });
});
