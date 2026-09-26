import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { withRls, withRlsBypass } from "../lib/rls";
import { copenhagenToday } from "../lib/validation";

// v3.0 Phase 3: global categories, richer events, tasks, shared notes,
// school timetable, handover packing and the overview endpoint.

async function family() {
  const app = createApp();
  const mom = await signupTestUser(app, { firstName: "Mia" });
  const child = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2018-05-14", relationship: "MOTHER" })).body;
  const dad = await signupTestUser(app, { firstName: "Dan" });
  await prisma.childAccess.create({ data: { childId: child.id, userId: dad.userId, role: "PARENT", relationship: "FATHER" } });
  const gran = await signupTestUser(app, { firstName: "Inger" });
  await prisma.childAccess.create({ data: { childId: child.id, userId: gran.userId, role: "FAMILY", relationship: "GRANDMOTHER_MAT" } });
  const carer = await signupTestUser(app, { firstName: "Sara" });
  await prisma.childAccess.create({ data: { childId: child.id, userId: carer.userId, role: "FAMILY", relationship: "CAREGIVER" } });
  const outsider = await signupTestUser(app, { firstName: "Olaf" });
  return { app, childId: child.id as string, mom, dad, gran, carer, outsider };
}

describe("Categories", () => {
  beforeEach(resetDb);

  it("lists the 11 built-in categories, which can't be changed", async () => {
    const { mom } = await family();
    const res = await mom.agent.get("/categories");
    expect(res.body.categories.filter((c: { key: string | null }) => c.key)).toHaveLength(11);
    expect((await mom.agent.patch("/categories/cat_health").send({ tone: "SAND" })).status).toBe(403);
  });

  it("a custom category is visible to the family circle, editable only by its owner, invisible to outsiders", async () => {
    const { mom, dad, outsider } = await family();
    const created = await mom.agent.post("/categories").send({ name: "Swimming", icon: "pool", tone: "SAGE" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const dadSees = (await dad.agent.get("/categories")).body.categories.find((c: { id: string }) => c.id === id);
    expect(dadSees).toMatchObject({ name: "Swimming", ownedByMe: false });
    expect((await dad.agent.patch(`/categories/${id}`).send({ name: "Swim" })).status).toBe(404);
    expect((await outsider.agent.get("/categories")).body.categories.some((c: { id: string }) => c.id === id)).toBe(false);
  });

  it("deleting a category in use archives it (items keep their label); unused ones are removed", async () => {
    const { mom, childId } = await family();
    const used = (await mom.agent.post("/categories").send({ name: "Chess", icon: "chess", tone: "NEUTRAL" })).body.id;
    const unused = (await mom.agent.post("/categories").send({ name: "Unused", icon: "circle", tone: "NEUTRAL" })).body.id;
    await mom.agent.post(`/children/${childId}/calendar-events`).send({ categoryIds: [used], title: "Chess club", startsAt: "2026-10-01T15:00:00Z" });

    expect((await mom.agent.delete(`/categories/${used}`)).status).toBe(204);
    expect((await mom.agent.delete(`/categories/${unused}`)).status).toBe(204);
    expect((await prisma.category.findUnique({ where: { id: used } }))?.archivedAt).not.toBeNull();
    expect(await prisma.category.findUnique({ where: { id: unused } })).toBeNull();

    // Archived: kept on the event, but can't be chosen for a new one.
    const again = await mom.agent.post(`/children/${childId}/calendar-events`).send({ categoryIds: [used], title: "x", startsAt: "2026-10-02T15:00:00Z" });
    expect(again.body.code).toBe("CATEGORY_UNKNOWN");
  });

  it("an item carries several categories; a moment using one keeps it archived rather than deleted", async () => {
    const { mom, childId } = await family();
    const chess = (await mom.agent.post("/categories").send({ name: "Chess", icon: "chess", tone: "NEUTRAL" })).body.id;
    const event = await mom.agent
      .post(`/children/${childId}/calendar-events`)
      .send({ categoryIds: ["cat_sport", chess, "cat_sport"], title: "Tournament", startsAt: "2026-10-01T15:00:00Z" });
    expect(event.body.categoryIds).toEqual(["cat_sport", chess]); // de-duplicated, order kept
    const edited = await mom.agent.patch(`/children/${childId}/calendar-events/${event.body.id}`).send({ title: "Tournament!" });
    expect(edited.body.categoryIds).toEqual(["cat_sport", chess]); // untouched when not sent
    const cleared = await mom.agent.patch(`/children/${childId}/calendar-events/${event.body.id}`).send({ categoryIds: [] });
    expect(cleared.body.categoryIds).toEqual([]);

    // Only a moment uses it now: deleting archives it instead of stripping the moment.
    const moment = (await mom.agent.post(`/children/${childId}/moments`).send({ title: "Won", categoryIds: [chess, "cat_milestone"] })).body;
    expect(moment.categoryIds).toEqual([chess, "cat_milestone"]);
    expect((await mom.agent.delete(`/categories/${chess}`)).status).toBe(204);
    expect((await prisma.category.findUnique({ where: { id: chess } }))?.archivedAt).not.toBeNull();

    const bad = await mom.agent.post(`/children/${childId}/tasks`).send({ title: "x", categoryIds: ["cat_sport", "nope"] });
    expect(bad.body.code).toBe("CATEGORY_UNKNOWN");
    expect((await mom.agent.post(`/children/${childId}/tasks`).send({ title: "x", categoryIds: "cat_sport" })).status).toBe(400);
  });

  it("an outsider's category can't be put on a family's event", async () => {
    const { mom, outsider, childId } = await family();
    const theirs = (await outsider.agent.post("/categories").send({ name: "Mine", icon: "circle", tone: "NEUTRAL" })).body.id;
    const res = await mom.agent.post(`/children/${childId}/calendar-events`).send({ categoryIds: [theirs], title: "x", startsAt: "2026-10-01T10:00:00Z" });
    expect(res.status).toBe(400);
  });
});

describe("Events: place, address, handled-by, packing list, national holidays", () => {
  beforeEach(resetDb);

  it("stores place + address + assignee + packing items; the assignee must be in the family", async () => {
    const { mom, dad, outsider, childId } = await family();
    const res = await mom.agent.post(`/children/${childId}/calendar-events`).send({
      categoryIds: ["cat_sport"],
      title: "Soccer Practice",
      startsAt: "2026-10-01T13:00:00Z",
      location: "Oakwood Soccer Field",
      address: "Field 3",
      assigneeUserId: dad.userId,
      checklist: [{ label: "Shin guards", kind: "PACKING" }, { label: "Sign form" }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ categoryIds: ["cat_sport"], location: "Oakwood Soccer Field", address: "Field 3", assigneeUserId: dad.userId, kind: "EVENT" });
    expect(res.body.checklist.map((c: { kind: string }) => c.kind)).toEqual(["PACKING", "TASK"]);

    const bad = await mom.agent.post(`/children/${childId}/calendar-events`).send({ title: "x", startsAt: "2026-10-01T10:00:00Z", assigneeUserId: outsider.userId });
    expect(bad.status).toBe(400);
  });

  it("seeds national holidays once, even when two requests race", async () => {
    const { mom, childId } = await family();
    const range = `/children/${childId}/calendar?start=2027-01-01&end=2027-12-31`;
    await Promise.all([mom.agent.get(range), mom.agent.get(range), mom.agent.get(range)]);
    const holidays = await withRlsBypass((tx) =>
      tx.calendarEvent.findMany({ where: { childId, kind: "NATIONAL_HOLIDAY", startsAt: { gte: new Date("2027-01-01"), lt: new Date("2028-01-01") } } }),
    );
    expect(holidays).toHaveLength(10);
    expect(new Set(holidays.flatMap((h) => h.categoryIds))).toEqual(new Set(["cat_holiday"]));
    const res = await mom.agent.get(range);
    const one = res.body.events.find((e: { kind: string }) => e.kind === "NATIONAL_HOLIDAY");
    expect(one.editable).toBe(false);
    expect((await mom.agent.patch(`/children/${childId}/calendar-events/${one.id}`).send({ title: "x" })).status).toBe(400);
  });
});

describe("Tasks", () => {
  beforeEach(resetDb);

  it("family members create tasks; a caregiver can tick one done but not create; outsiders see nothing", async () => {
    const { gran, carer, outsider, childId } = await family();
    const task = await gran.agent.post(`/children/${childId}/tasks`).send({ title: "Wash shin guards", dueOn: "2026-10-02", categoryIds: ["cat_sport"] });
    expect(task.status).toBe(201);
    expect(task.body).toMatchObject({ dueOn: "2026-10-02", categoryIds: ["cat_sport"], createdByUserId: gran.userId });

    expect((await carer.agent.post(`/children/${childId}/tasks`).send({ title: "x" })).status).toBe(403);
    expect((await carer.agent.patch(`/children/${childId}/tasks/${task.body.id}`).send({ title: "renamed" })).status).toBe(403);
    const done = await carer.agent.patch(`/children/${childId}/tasks/${task.body.id}`).send({ completed: true });
    expect(done.status).toBe(200);
    expect(done.body.completedByUserId).toBe(carer.userId);

    expect((await outsider.agent.get(`/children/${childId}/tasks`)).status).toBe(403);
    expect(await withRls(outsider.userId, (tx) => tx.task.findMany({ where: { childId } }))).toHaveLength(0); // RLS, no app check
  });

  it("rejects malformed due dates", async () => {
    const { mom, childId } = await family();
    expect((await mom.agent.post(`/children/${childId}/tasks`).send({ title: "x", dueOn: "tomorrow" })).status).toBe(400);
  });
});

describe("Shared notes", () => {
  beforeEach(resetDb);

  it("the author edits; others can't; a parent may remove any note; caregivers can't write; RLS hides it from outsiders", async () => {
    const { mom, dad, gran, carer, outsider, childId } = await family();
    const note = await gran.agent.post(`/children/${childId}/notes`).send({ title: "Lunch preference", text: "Apples, not bananas" });
    expect(note.status).toBe(201);
    expect(note.body.authorUserId).toBe(gran.userId);

    expect((await dad.agent.patch(`/children/${childId}/notes/${note.body.id}`).send({ title: "x" })).status).toBe(403);
    expect((await gran.agent.patch(`/children/${childId}/notes/${note.body.id}`).send({ title: "Lunch" })).body.title).toBe("Lunch");
    expect((await carer.agent.post(`/children/${childId}/notes`).send({ title: "x" })).status).toBe(403);
    expect(await withRls(outsider.userId, (tx) => tx.childNote.findMany({ where: { childId } }))).toHaveLength(0);
    expect((await mom.agent.delete(`/children/${childId}/notes/${note.body.id}`)).status).toBe(204);
  });
});

describe("School timetable", () => {
  beforeEach(resetDb);

  it("parents manage lessons (validated); family members read only", async () => {
    const { mom, gran, childId } = await family();
    const lesson = await mom.agent.post(`/children/${childId}/school-lessons`).send({ weekday: 3, startTime: "13:00", subject: "Physical Education", room: "Gym", bring: "Gym gear" });
    expect(lesson.status).toBe(201);
    expect((await mom.agent.post(`/children/${childId}/school-lessons`).send({ weekday: 8, startTime: "13:00", subject: "x" })).status).toBe(400);
    expect((await mom.agent.post(`/children/${childId}/school-lessons`).send({ weekday: 1, startTime: "1pm", subject: "x" })).status).toBe(400);
    expect((await gran.agent.post(`/children/${childId}/school-lessons`).send({ weekday: 1, startTime: "09:00", subject: "x" })).status).toBe(403);
    expect((await gran.agent.get(`/children/${childId}/school-lessons`)).body.lessons).toHaveLength(1);
  });
});

describe("Handover packing", () => {
  beforeEach(resetDb);

  it("parents edit the list; anyone ticks items; ticks count for the upcoming handover", async () => {
    const { mom, dad, gran, childId } = await family();
    const today = copenhagenToday();
    await mom.agent.put(`/children/${childId}/custody-plan`).send({
      label: "7/7",
      startDate: today,
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: mom.userId, days: 7 }, { userId: dad.userId, days: 7 }] },
      handoverTime: "15:00",
      handoverLocation: "Oakwood School",
    });
    const set = await mom.agent.put(`/children/${childId}/handover-packing`).send({ items: [{ label: "Backpack" }, { label: "Inhaler" }] });
    expect(set.status).toBe(200);
    const expectedHandover = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    expect(set.body.forDate).toBe(expectedHandover);

    expect((await gran.agent.put(`/children/${childId}/handover-packing`).send({ items: [] })).status).toBe(403);
    const ticked = await gran.agent.patch(`/children/${childId}/handover-packing/${set.body.items[0].id}`).send({ packed: true });
    expect(ticked.body.items.map((i: { packed: boolean }) => i.packed)).toEqual([true, false]);

    // Renaming keeps the tick; removing drops the item.
    const renamed = await mom.agent.put(`/children/${childId}/handover-packing`).send({ items: [{ id: set.body.items[0].id, label: "School backpack" }] });
    expect(renamed.body.items).toEqual([expect.objectContaining({ label: "School backpack", packed: true })]);
  });
});

describe("Overview", () => {
  beforeEach(resetDb);

  it("returns custody (today, next handover), events, tasks, notes, lessons, swaps and permissions per child", async () => {
    const { mom, dad, gran, outsider, childId } = await family();
    const today = copenhagenToday();
    await mom.agent.put(`/children/${childId}/custody-plan`).send({
      label: "7/7",
      startDate: today,
      patternDays: { cycleLengthDays: 14, blocks: [{ userId: mom.userId, days: 7 }, { userId: dad.userId, days: 7 }] },
      handoverTime: "15:00",
      handoverLocation: "Oakwood School",
    });
    await mom.agent.post(`/children/${childId}/calendar-events`).send({ categoryIds: ["cat_health"], title: "Dentist", startsAt: `${today}T10:15:00Z` });
    await mom.agent.post(`/children/${childId}/tasks`).send({ title: "Allergy medicine" });
    await mom.agent.post(`/children/${childId}/notes`).send({ title: "Lunch" });
    await mom.agent.post(`/children/${childId}/school-lessons`).send({ weekday: 1, startTime: "09:00", subject: "Math" });
    await gran.agent.post(`/children/${childId}/swap-requests`).send({ date: today });

    const res = await gran.agent.get(`/overview?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(today);
    const c = res.body.children[0];
    expect(c.custody.today).toMatchObject({ holderUserId: mom.userId, dayOfBlock: 1, blockLengthDays: 7 });
    expect(c.custody.today.nextHandover).toMatchObject({ toUserId: dad.userId, time: "15:00", location: "Oakwood School" });
    expect(c.custody.byDate[today]).toBe(mom.userId);
    expect(c.events.some((e: { title: string }) => e.title === "Dentist")).toBe(true);
    expect(c.tasks).toHaveLength(1);
    expect(c.notes).toHaveLength(1);
    expect(c.lessons).toHaveLength(1);
    expect(c.pendingSwaps).toHaveLength(1);
    expect(c.members.map((m: { firstName: string }) => m.firstName)).toEqual(["Mia", "Dan", "Inger", "Sara"]);
    expect(c.can).toEqual({ manageEvents: false, requestSwap: true, approveSwap: false, editCustody: false }); // grandmother

    expect((await outsider.agent.get(`/overview?from=${today}&to=${today}`)).body.children).toEqual([]);
    expect((await outsider.agent.get(`/overview?from=${today}&to=${today}&childIds=${childId}`)).body.children).toEqual([]);
  });

  it("rejects bad or oversized ranges", async () => {
    const { mom } = await family();
    expect((await mom.agent.get("/overview?from=2026-01-01")).status).toBe(400);
    expect((await mom.agent.get("/overview?from=2026-01-10&to=2026-01-01")).status).toBe(400);
    expect((await mom.agent.get("/overview?from=2026-01-01&to=2026-06-01")).status).toBe(400);
  });
});
