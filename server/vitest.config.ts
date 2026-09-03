import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Test files share one real Postgres DB and one real uploads/ directory
    // (no mocks) — running files in parallel races their before/after
    // snapshots against each other. Sequential keeps that shared state safe.
    fileParallelism: false,
  },
});
