import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    pool: "forks",
    maxWorkers: 1,
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
