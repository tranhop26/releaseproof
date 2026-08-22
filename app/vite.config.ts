import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    // genlayer-js ships chain definitions with the browser client. Keep the
    // warning threshold explicit while preserving a single deterministic app.
    chunkSizeWarningLimit: 850,
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks",
    maxWorkers: 1,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
