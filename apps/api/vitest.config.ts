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
  },
});
