import { describe, it, expect, beforeEach } from "vitest";

import { createApp } from "../app";
import { resetDb } from "../testUtils/db";
import { signupTestUser } from "../testUtils/auth";
import { copenhagenMidnight } from "./validation";

// A family's day is a Danish day. Found in the Phase 8 regression run just
// after midnight: range queries used UTC midnight, so anything between 00:00
// and 01:00/02:00 Copenhagen time showed on the previous day.

describe("copenhagenMidnight", () => {
  it("is 22:00 UTC the day before in summer, 23:00 in winter", () => {
    expect(copenhagenMidnight("2026-09-24").toISOString()).toBe("2026-09-23T22:00:00.000Z");
    expect(copenhagenMidnight("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("handles both DST changes (23- and 25-hour days)", () => {
    // Spring forward 2026-03-29, fall back 2026-10-25: midnight itself is unaffected.
    expect(copenhagenMidnight("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(copenhagenMidnight("2026-03-30").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(copenhagenMidnight("2026-10-25").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(copenhagenMidnight("2026-10-26").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("day ranges", () => {
  beforeEach(resetDb);

  it("an appointment at 00:30 Copenhagen time shows on its own day, not the day before", async () => {
    const app = createApp();
    const mom = await signupTestUser(app);
    const leo = (await mom.agent.post("/children").send({ firstName: "Leo", gender: "BOY", birthday: "2018-05-14", relationship: "MOTHER" })).body.id as string;
    // 2026-10-14 00:30 CEST = 2026-10-13 22:30 UTC.
    await mom.agent.post(`/children/${leo}/calendar-events`).send({ title: "Night flight", startsAt: "2026-10-13T22:30:00.000Z" });

    const on14 = await mom.agent.get("/overview?from=2026-10-14&to=2026-10-14");
    const on13 = await mom.agent.get("/overview?from=2026-10-13&to=2026-10-13");
    const titles = (res: typeof on14) => res.body.children[0].events.map((e: { title: string }) => e.title);
    expect(titles(on14)).toContain("Night flight");
    expect(titles(on13)).not.toContain("Night flight");
  });
});
