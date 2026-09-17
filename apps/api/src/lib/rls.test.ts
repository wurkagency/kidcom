import { describe, it, expect } from "vitest";

import { withRls } from "./rls";

// v2.0 RLS pilot (plan §3.2/§1) — the single riskiest detail in the branch:
// SET LOCAL must be scoped to the same transaction as the query it gates,
// or a pooled connection can leak one user's context into another user's
// request. This is a throwaway-table-free prototype of the mechanism
// itself, run before any real RLS policy exists: many concurrent
// withRls() calls, each under a different fake "user id", each reading
// back current_setting('app.current_user_id') from inside its own
// transaction and asserting it only ever sees its own value — never
// another interleaved call's.
describe("withRls — pooled-connection isolation (prototype, no real table yet)", () => {
  it("two interleaved requests as different users never see each other's GUC value", async () => {
    const [resultA, resultB] = await Promise.all([
      withRls("user-aaa", async (tx) => {
        await new Promise((r) => setTimeout(r, 15));
        const rows = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.current_user_id', true) AS v`;
        return rows[0].v;
      }),
      withRls("user-bbb", async (tx) => {
        const rows = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.current_user_id', true) AS v`;
        await new Promise((r) => setTimeout(r, 15));
        return rows[0].v;
      }),
    ]);

    expect(resultA).toBe("user-aaa");
    expect(resultB).toBe("user-bbb");
  });

  it("many concurrent calls across a shared connection pool never bleed into each other", async () => {
    const userIds = Array.from({ length: 20 }, (_, i) => `pool-user-${i}`);
    const results = await Promise.all(
      userIds.map((userId) =>
        withRls(userId, async (tx) => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          const rows = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.current_user_id', true) AS v`;
          return rows[0].v;
        })
      )
    );

    expect(results).toEqual(userIds);
  });

  it("the GUC does not leak outside its own transaction — a plain query afterwards sees no value", async () => {
    const { prisma } = await import("../db");
    await withRls("leaky-user-check", async (tx) => {
      const rows = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.current_user_id', true) AS v`;
      return rows[0].v;
    });
    const after = await prisma.$queryRaw<{ v: string }[]>`SELECT current_setting('app.current_user_id', true) AS v`;
    expect(after[0].v).toBe("");
  });
});
