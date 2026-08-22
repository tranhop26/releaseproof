import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks",
    maxWorkers: 1,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
