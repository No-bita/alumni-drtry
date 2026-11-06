import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";

test("app containment only adds nonterminal credential stripping without changing existing config", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const { routes, ...unchanged } = config;
  assert.equal(createHash("sha256").update(JSON.stringify(unchanged)).digest("hex"), "b35015ae4051c79061069ee62aa8815a739957a4b0ce6abd7495a4637faf6a34");
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

test("only the map document allows same-origin framing, with no overlapping frame policy", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const frameRules = config.headers.filter((rule: { headers: { key: string }[] }) =>
    rule.headers.some(header => header.key.toLowerCase() === "x-frame-options"),
  );
  assert.deepEqual(frameRules, [
    { source: "/((?!app/media/World_Map_Vns\\.html$).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    { source: "/app/media/World_Map_Vns.html", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
  ]);
  const mapPath = "/app/media/World_Map_Vns.html";
  const denyPattern = new RegExp(`^${frameRules[0].source}$`);
  for (const pathname of ["/", "/app", "/app/login", "/v1/healthz", "/app/media/other.html", `${mapPath}/extra`, "/app/media/World_Map_VnsXhtml", "/app/media/world_map_vns.html"]) {
    assert.equal(denyPattern.test(pathname), true, pathname);
    assert.notEqual(pathname, frameRules[1].source);
  }
  assert.equal(denyPattern.test(mapPath), false);
  assert.equal(frameRules[1].source, mapPath);
  const sharedHeaders = config.headers.find((rule: { source: string }) => rule.source === "/(.*)").headers;
  assert.equal(sharedHeaders.some((header: { key: string }) => header.key.toLowerCase() === "x-frame-options"), false);
  assert.equal(sharedHeaders.find((header: { key: string }) => header.key === "Content-Security-Policy-Report-Only").value.includes("frame-ancestors 'none'"), true);
});

test("the release map framing exception preserves the production API target", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  assert.equal(config.rewrites.find((rule: { source: string }) => rule.source === "/v1/(.*)").destination, "https://alma-mater-api.onrender.com/v1/$1");
});
