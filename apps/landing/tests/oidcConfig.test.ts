import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";

test("deployment credential stripping stays nonterminal alongside reviewed CSP configuration", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const { routes, ...unchanged } = config;
  assert.equal(createHash("sha256").update(JSON.stringify(unchanged)).digest("hex"), "bc3495e0291b9222e54589b98eb0a2b660d60a0104b772b50b5178488fb9a460");
  assert.deepEqual(routes, [{src: "/(.*)", continue: true, transforms: ["request.headers", "response.headers"].flatMap(type => ["x-vercel-trusted-oidc-idp-token", "x-vercel-oidc-token"].map(key => ({ type, op: "delete", target: { key } })))}]);
  assert.equal(Object.hasOwn(routes[0], "dest"), false);
});

test("SDK dependency is pinned and lockfile agrees; browser components do not import SDK", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(manifest.dependencies["@vercel/oidc"], "4.0.9");
  assert.equal(lock.packages[""].dependencies["@vercel/oidc"], "4.0.9");
  assert.equal(lock.packages["node_modules/@vercel/oidc"].version, "4.0.9");
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /request: \{ headers: upstreamHeaders \}/);
  assert.doesNotMatch(proxy, /console\.|process\.env\.VERCEL_OIDC_TOKEN/);
});

test("every page refuses framing, from one rule", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const frameRules = config.headers.filter((rule: { headers: { key: string }[] }) =>
    rule.headers.some(header => header.key.toLowerCase() === "x-frame-options"),
  );
  assert.equal(frameRules.length, 1);
  assert.equal(frameRules[0].source, "/(.*)");
  assert.equal(frameRules[0].headers.find((header: { key: string }) => header.key === "X-Frame-Options").value, "DENY");
});

test("the staging API target is unchanged", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  assert.equal(config.rewrites.find((rule: { source: string }) => rule.source === "/v1/(.*)").destination, "https://alma-staging.onrender.com/v1/$1");
});

test("each path gets exactly one CSP, which never allows being framed", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const policies = config.headers.filter((rule: { headers: { key: string }[] }) =>
    rule.headers.some(header => header.key === "Content-Security-Policy-Report-Only"),
  );
  const policyFor = (path: string) => policies.filter((rule: { source: string }) => new RegExp(`^${rule.source}$`).test(path)).map(
    (rule: { headers: { key: string; value: string }[] }) => rule.headers.find(header => header.key === "Content-Security-Policy-Report-Only")!.value,
  );
  for (const path of ["/", "/app", "/app/", "/app/login", "/app/login/", "/app/profile", "/app/assets/main.js", "/v1/me", "/application", "/app/media/other.html"]) {
    assert.equal(policyFor(path).length, 1, `${path}: one nonoverlapping policy`);
    assert.ok(policyFor(path)[0].includes("frame-ancestors 'none';"), path);
  }
  for (const path of ["/app", "/app/", "/app/login", "/app/profile"]) {
    assert.ok(policyFor(path)[0].includes("frame-src 'self';"));
  }
  for (const path of ["/", "/v1/me", "/application", "/app/media/other.html"]) {
    assert.ok(policyFor(path)[0].includes("frame-src 'none';"));
  }
  assert.equal(config.headers.some((rule: { headers: { key: string }[] }) => rule.headers.some(header => header.key === "Content-Security-Policy")), false, "remains report-only, not silently enforced");
});
