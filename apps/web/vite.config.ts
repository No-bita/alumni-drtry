import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { isStagingDeployment } from "./src/lib/stagingEnvironment";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vendor chunk strategy: stable, long-cacheable groups so app/route code can ship often
 * without invalidating React, router, or analytics. (@fontsource stays in vendor-misc — see comment below.)
 */
function manualChunks(id: string): string | undefined {
  // Never force CSS into JS manual chunks. This avoids broken ESM export names
  // from numeric @fontsource files (e.g. `300.css`) in some bundler outputs.
  if (id.endsWith(".css")) {
    return undefined;
  }

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

  // Keep @fontsource out of manual chunking to avoid broken ESM for
  // files like `300.css` (`Export ',300_exports' is not defined in module`).
  if (id.includes("node_modules/@fontsource/")) {
    return undefined;
  }

  if (id.includes("node_modules/@vercel/analytics")) {
    return "vendor-analytics";
  }

  // Any other transitive dependency
  return "vendor-misc";
}

const APP_BASE = "/app/";

/** Site-root files (robots.txt, sitemap.xml) live in site-root/ and are copied to dist/, outside the app's base. */
function siteRootFiles(): Plugin {
  return {
    name: "alma-site-root-files",
    apply: "build",
    buildStart() {
      // dist/ holds only this build: the app under dist/app plus the site-root files.
      fs.rmSync(path.join(webRoot, "dist"), { recursive: true, force: true });
    },
    closeBundle() {
      const from = path.join(webRoot, "site-root");
      const to = path.join(webRoot, "dist");
      if (!fs.existsSync(from)) return;
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) fs.copyFileSync(path.join(from, name), path.join(to, name));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // The app lives under /app (almamatter.in/app). The router's basename, public files and built assets
  // all follow this. API calls stay at the site root (/v1/...).
  base: APP_BASE,
  plugins: [react(), siteRootFiles()],
  define: {
    "__ALMA_STAGING__": JSON.stringify(
      isStagingDeployment(process.env.VERCEL_ENV, process.env.VERCEL_GIT_COMMIT_REF),
    ),
  },
  resolve: {
    alias: {
      "@department-catalog": path.resolve(webRoot, "../api/src/constants/departmentCatalog.ts"),
    },
  },
  build: {
    // Everything the app serves goes under dist/app; dist/ itself holds the site-root files (robots.txt,
    // sitemap.xml). Vercel's output directory is dist (see vercel.json).
    outDir: "dist/app",
    emptyOutDir: true,
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
