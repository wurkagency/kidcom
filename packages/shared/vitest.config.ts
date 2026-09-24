import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Sources only: the package build writes compiled copies to dist/.
    include: ["src/**/*.test.ts"],
  },
});
