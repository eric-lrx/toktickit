import { defineConfig, devices } from "@playwright/test";

// Issue 12 — Playwright was explicitly excluded from Lab 1, introduced here.
// A single default (desktop) project: the main flow spec only needs to run
// once, and responsive.spec.ts sets its own viewport per test instead of
// running every spec through a 3-viewport project matrix.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
});
