import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vendor chunk strategy: stable, long-cacheable groups so app/route code can ship often
 * without invalidating React, router, or analytics. (@fontsource stays in vendor-misc — see comment below.)
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  // React + reconciler deps (tightly coupled; update together)
  if (
    id.includes("node_modules/react-dom") ||
    id.includes("node_modules/react/") ||
    id.endsWith("/node_modules/react") ||
    id.includes("node_modules/scheduler")
  ) {
    return "vendor-react";
  }

  if (id.includes("node_modules/react-router")) {
    return "vendor-router";
  }

  if (id.includes("node_modules/@tanstack/")) {
    return "vendor-tanstack";
  }

  // Do not split @fontsource into its own chunk — Rollup can emit broken ESM for
  // files like `300.css` (Export '_300_exports' is not defined) when manual chunked.

  if (id.includes("node_modules/@vercel/analytics")) {
    return "vendor-analytics";
  }

  // Any other transitive dependency
  return "vendor-misc";
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@department-catalog": path.resolve(webRoot, "../api/src/constants/departmentCatalog.ts"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
        // Readable chunk names in analyze output; content hash still in filename
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    proxy: {
      "/v1": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
