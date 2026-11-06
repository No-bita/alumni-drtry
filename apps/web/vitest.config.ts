import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Same base as the build (vite.config.ts): the app lives under /app.
  base: "/app/",
  resolve: {
    alias: {
      "@department-catalog": path.resolve(webRoot, "../api/src/constants/departmentCatalog.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
    // import.meta.env.BASE_URL as in production builds (Vitest doesn't take it from `base`).
    env: { BASE_URL: "/app/" },
  },
});
