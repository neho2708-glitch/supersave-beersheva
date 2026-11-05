import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@backend": resolve(__dirname, "backend/src"),
      "@": resolve(__dirname, "frontend/src"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
