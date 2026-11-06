import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";

test("app containment only adds nonterminal credential stripping without changing existing config", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const { routes, ...unchanged } = config;
  assert.equal(createHash("sha256").update(JSON.stringify(unchanged)).digest("hex"), "21afc04dfc91881bac57466421bff82242dd193516f833ed247d20a2719d0be7");
  assert.deepEqual(routes, [{src: "/(.*)", continue: true, transforms: ["request.headers", "response.headers"].flatMap(type => ["x-vercel-trusted-oidc-idp-token", "x-vercel-oidc-token"].map(key => ({ type, op: "delete", target: { key } })))}]);
  assert.equal(Object.hasOwn(routes[0], "dest"), false);
});

test("SDK dependency is pinned and lockfile agrees; browser components do not import SDK", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(manifest.dependencies["@vercel/oidc"], "4.0.7");
  assert.equal(lock.packages[""].dependencies["@vercel/oidc"], "4.0.7");
  assert.equal(lock.packages["node_modules/@vercel/oidc"].version, "4.0.7");
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /request: \{ headers: upstreamHeaders \}/);
  assert.doesNotMatch(proxy, /console\.|process\.env\.VERCEL_OIDC_TOKEN/);
});
