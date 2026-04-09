import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIST_ASSETS_DIR = path.resolve(process.cwd(), "dist/assets");

const budgets = {
  // Critical path budget for initial home route + key shared chunks.
  homeCriticalJsGzipBytes: 200 * 1024,
  // Keep route-specific chunk reasonably small.
  homeRouteJsGzipBytes: 80 * 1024,
};

function gzipSize(filePath) {
  const raw = readFileSync(filePath);
  return gzipSync(raw).byteLength;
}

function findAssetByPrefix(files, prefix) {
  return files.find((f) => f.startsWith(prefix) && f.endsWith(".js")) ?? null;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main() {
  const files = readdirSync(DIST_ASSETS_DIR);

  const requiredPrefixes = [
    "Home-",
    "BulletinPanel-",
    "vendor-react-",
    "vendor-router-",
    "vendor-tanstack-",
    "index-",
  ];

  const resolved = requiredPrefixes.map((prefix) => {
    const name = findAssetByPrefix(files, prefix);
    if (!name) {
      throw new Error(`Missing expected chunk for prefix "${prefix}" in dist/assets.`);
    }
    return name;
  });

  const entryRows = resolved.map((name) => {
    const filePath = path.join(DIST_ASSETS_DIR, name);
    return { name, gzipBytes: gzipSize(filePath) };
  });

  const homeChunk = entryRows.find((r) => r.name.startsWith("Home-"));
  if (!homeChunk) {
    throw new Error("Home chunk was not found after resolving expected chunks.");
  }

  const totalCriticalGzip = entryRows.reduce((sum, r) => sum + r.gzipBytes, 0);

  console.log("Performance budget report (gzip sizes):");
  for (const row of entryRows) {
    console.log(`- ${row.name}: ${formatBytes(row.gzipBytes)}`);
  }
  console.log(`- critical total: ${formatBytes(totalCriticalGzip)}`);

  const failures = [];
  if (homeChunk.gzipBytes > budgets.homeRouteJsGzipBytes) {
    failures.push(
      `Home route chunk exceeds budget: ${formatBytes(homeChunk.gzipBytes)} > ${formatBytes(budgets.homeRouteJsGzipBytes)}`
    );
  }
  if (totalCriticalGzip > budgets.homeCriticalJsGzipBytes) {
    failures.push(
      `Home critical JS exceeds budget: ${formatBytes(totalCriticalGzip)} > ${formatBytes(budgets.homeCriticalJsGzipBytes)}`
    );
  }

  if (failures.length > 0) {
    console.error("\nBudget check failed:");
    for (const f of failures) {
      console.error(`- ${f}`);
    }
    process.exit(1);
  }

  console.log("\nAll performance budgets passed.");
}

try {
  main();
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`Performance budget script failed: ${msg}`);
  process.exit(1);
}
