import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./quickpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./quickpay")>()),
  cancelSubscription: vi.fn(async () => undefined),
}));

import { createApp } from "../app";
import { prisma } from "../db";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import * as quickpay from "./quickpay";
import { resetForLaunch } from "./launchReset";
import { withRlsBypass } from "./rls";

// D8: at launch every user and their data goes, except one account, which
// keeps its own children and what's attached to them.
describe("resetForLaunch (D8)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  async function world() {
    const app = createApp();
    const keep = await signupTestUser(app, { email: "keep@example.com", firstName: "Keep" });
    const other = await signupTestUser(app, { email: "other@example.com", firstName: "Other" });
    const stranger = await signupTestUser(app, { email: "stranger@example.com", firstName: "Stranger" });
    const mine = (await keep.agent.post("/children").send({ firstName: "Mine", gender: "GIRL", birthday: "2019-01-01", relationship: "MOTHER" })).body.id as string;
    const theirs = (await stranger.agent.post("/children").send({ firstName: "Theirs", gender: "BOY", birthday: "2018-01-01", relationship: "FATHER" })).body.id as string;
    // The other user co-parents my child and has written on it.
    await prisma.childAccess.create({ data: { childId: mine, userId: other.userId, role: "PARENT", relationship: "FATHER" } });
    await other.agent.post(`/children/${mine}/moments`).send({ title: "From other", childIds: [mine] });
    await keep.agent.post(`/children/${mine}/moments`).send({ title: "From keep", childIds: [mine] });
    await prisma.subscription.update({ where: { ownerId: stranger.userId }, data: { quickpaySubscriptionId: "777" } });
    return { keep, other, stranger, mine, theirs };
  }

  it("reports without changing anything unless confirmed", async () => {
    await world();
    const report = await resetForLaunch({ keepEmail: "keep@example.com", confirm: false });
    expect(report).toMatchObject({ users: 2, children: 1, quickpaySubscriptions: 1, done: false });
    expect(await prisma.user.count()).toBe(3);
  });

  it("keeps one account and its children; removes everyone else, their children and what they wrote", async () => {
    const { keep, mine, theirs } = await world();
    const report = await resetForLaunch({ keepEmail: "KEEP@example.com", confirm: true });
    expect(report.done).toBe(true);
    expect(quickpay.cancelSubscription).toHaveBeenCalledWith(777);

    expect((await prisma.user.findMany({ select: { id: true } })).map((u) => u.id)).toEqual([keep.userId]);
    expect(await prisma.child.findUnique({ where: { id: theirs } })).toBeNull();
    expect(await prisma.child.findUnique({ where: { id: mine } })).not.toBeNull();
    const titles = (await withRlsBypass((tx) => tx.moment.findMany({ select: { title: true } }))).map((m) => m.title);
    expect(titles).toEqual(["From keep"]);
    expect(await prisma.childAccess.findMany({ where: { childId: mine }, select: { userId: true } })).toEqual([{ userId: keep.userId }]);
  });

  it("refuses when the account to keep doesn't exist", async () => {
    await world();
    await expect(resetForLaunch({ keepEmail: "nobody@example.com", confirm: true })).rejects.toThrow(/No account/);
    expect(await prisma.user.count()).toBe(3);
  });
});
