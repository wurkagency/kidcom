import { defineConfig, devices } from "@playwright/test";

// Checks against the PRODUCTION build (not the dev server): built fresh and
// served by `vite preview` with the production security headers
// (security-headers.ts). Run with: npm run test:csp --workspace=apps/web
export default defineConfig({
  testDir: "./e2e/production",
  outputDir: "./e2e/.results",
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    // Always the build under test, never a stale preview.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
