#!/usr/bin/env node
// CI guard: apps/web must only ever proxy /v1 to the PRODUCTION API on main.
// The staging branch rewrites /v1 to the staging API; this check fails any
// pull request that would bring a non-production API target onto main,
// which is what prevents staging routing from ever reaching production.
import { readFileSync } from "node:fs";

const PRODUCTION_API_ORIGIN = "https://alma-mater-api.onrender.com";
const VERCEL_CONFIG_PATH = "apps/web/vercel.json";

const config = JSON.parse(readFileSync(VERCEL_CONFIG_PATH, "utf8"));
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

const apiRewrites = rewrites.filter(
  (rule) => typeof rule.source === "string" && rule.source.startsWith("/v1/")
);

if (apiRewrites.length === 0) {
  console.error(
    `check-web-api-target: no /v1 rewrite found in ${VERCEL_CONFIG_PATH}. ` +
      "The web app would lose its API proxy; refusing to pass."
  );
  process.exit(1);
}

const offenders = apiRewrites.filter(
  (rule) =>
    typeof rule.destination !== "string" ||
    !rule.destination.startsWith(`${PRODUCTION_API_ORIGIN}/`)
);

if (offenders.length > 0) {
  console.error(
    `check-web-api-target: /v1 must proxy to the production API (${PRODUCTION_API_ORIGIN}) on main. Found:`
  );
  for (const rule of offenders) {
    console.error(`  ${rule.source} -> ${rule.destination}`);
  }
  console.error(
    "A staging API target belongs only on the staging branch. See docs/staging.md."
  );
  process.exit(1);
}

console.log(
  `check-web-api-target: /v1 proxies to ${PRODUCTION_API_ORIGIN} (production). OK.`
);
