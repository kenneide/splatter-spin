import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative assets work for both repository Pages and custom domains.
  base: "./",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
