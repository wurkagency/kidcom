import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./src/testUtils/setupEnv.ts"],
    // Integration tests share one real Postgres test database (see
    // testUtils/db.ts's per-test truncate) — running files in parallel
    // workers would race each other's resetDb() calls.
    fileParallelism: false,
    // Child processes rather than worker threads: under Node 24 on Windows a
    // native module (Prisma engine / sharp) segfaults the shared thread pool
    // (0xC0000005). Forks contain it to one file; see tasks/todo.md.
    pool: "forks",
  },
});
