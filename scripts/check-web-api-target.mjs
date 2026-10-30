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

// Vercel rewrites are first-match-wins: a rule placed before the /v1 rule
// can capture /v1 traffic and shadow the production proxy. A rule can match
// /v1/* when the literal part of its source (before any :param, (group) or
// wildcard) either targets /v1 or is short enough to swallow it.
function literalPrefix(source) {
  const firstPatternChar = source.search(/[(:*?+{\[]/);
  return firstPatternChar === -1 ? source : source.slice(0, firstPatternChar);
}

function canMatchV1(source) {
  if (typeof source !== "string" || !source.startsWith("/")) return false;
  const literal = literalPrefix(source);
  if (literal === "/v1" || literal.startsWith("/v1/")) return true;
  if (literal.length <= 1) return true; // "/(.*)", "/:path*", "/*", ...
  return "/v1".startsWith(literal); // partial literal such as "/v" + param
}

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

// First-match-wins: the first rewrite able to capture /v1 traffic must be
// the production /v1 proxy itself, or an earlier catch-all would shadow it
// while every explicit /v1 rule still points at production.
const firstV1Match = rewrites.find((rule) => canMatchV1(rule.source));
if (
  !firstV1Match ||
  typeof firstV1Match.destination !== "string" ||
  !firstV1Match.destination.startsWith(`${PRODUCTION_API_ORIGIN}/`)
) {
  console.error(
    `check-web-api-target: a rewrite placed before the /v1 rule can capture /v1 traffic ` +
      `without sending it to the production API (${PRODUCTION_API_ORIGIN}):`
  );
  if (firstV1Match) {
    console.error(`  ${firstV1Match.source} -> ${firstV1Match.destination}`);
  }
  console.error(
    "Vercel applies rewrites in order, so this rule shadows the production /v1 proxy. " +
      "Move it after the /v1 rule or narrow its source. See docs/staging.md."
  );
  process.exit(1);
}

console.log(
  `check-web-api-target: /v1 proxies to ${PRODUCTION_API_ORIGIN} (production). OK.`
);
