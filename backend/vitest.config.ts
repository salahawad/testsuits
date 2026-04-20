import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    // Integration tests share a single database; running files in parallel would
    // cause truncate/seed races. Serial execution is slow but deterministic.
    fileParallelism: false,
    setupFiles: ["src/__tests__/helpers/setup.ts"],
  },
});
