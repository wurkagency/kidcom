import { defineConfig, devices } from "@playwright/test";

// Two projects:
//  - visual: renders screens against mocked API fixtures (mirroring the
//    Stitch sample content) at the Stitch export geometry — 390 CSS px wide,
//    1.5 device pixel ratio — and diffs them against docs/design/aura.
//  - e2e:    real flows against the running API (docker Postgres/Redis).
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  reporter: [["list"]],
  // A cold dev server compiles each lazy screen chunk on first request;
  // under parallel workers that can outlast the 5s default.
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "visual",
      testDir: "./e2e/visual",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1.5,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
