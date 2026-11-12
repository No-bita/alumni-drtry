import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";

test("deployment credential stripping stays nonterminal alongside reviewed CSP configuration", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const { routes, ...unchanged } = config;
  assert.equal(createHash("sha256").update(JSON.stringify(unchanged)).digest("hex"), "5ac9026de852cc839489b8502d844511afc94926e68a477b5973b94596ec1126");
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
  assert.equal(sharedHeaders.some((header: { key: string }) => header.key === "Content-Security-Policy-Report-Only"), false);
});

test("the staging map framing exception preserves the staging API target", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  assert.equal(config.rewrites.find((rule: { source: string }) => rule.source === "/v1/(.*)").destination, "https://alma-staging.onrender.com/v1/$1");
});

test("map CSP is isolated, hash-bound and permits only the existing map dependencies", () => {
  const config = JSON.parse(readFileSync("../web/vercel.json", "utf8"));
  const policies = config.headers.filter((rule: { headers: { key: string }[] }) =>
    rule.headers.some(header => header.key === "Content-Security-Policy-Report-Only"),
  );
  const policyFor = (path: string) => policies.filter((rule: { source: string }) =>
    rule.source === "/app/media/World_Map_Vns.html" ? path === rule.source : new RegExp(`^${rule.source}$`).test(path),
  ).map((rule: { headers: { key: string; value: string }[] }) =>
    rule.headers.find(header => header.key === "Content-Security-Policy-Report-Only")!.value,
  );
  const mapPath = "/app/media/World_Map_Vns.html";
  for (const path of ["/", "/app", "/app/", "/app/login", "/app/login/", "/app/profile", mapPath, "/app/assets/main.js", "/v1/me", `${mapPath}/extra`, "/application", "/app/media/World_Map_VnsXhtml"]) {
    assert.equal(policyFor(path).length, 1, `${path}: one nonoverlapping policy`);
  }
  for (const path of ["/app", "/app/", "/app/login", "/app/profile"]) {
    assert.ok(policyFor(path)[0].includes("frame-src 'self';"));
    assert.ok(policyFor(path)[0].includes("frame-ancestors 'none';"));
  }
  for (const path of ["/", "/v1/me", "/application", "/app/media/other.html"]) {
    assert.ok(policyFor(path)[0].includes("frame-src 'none';"));
    assert.ok(policyFor(path)[0].includes("frame-ancestors 'none';"));
  }
  const mapPolicy = policyFor(mapPath)[0];
  assert.ok(mapPolicy.includes("frame-ancestors 'self';"));
  assert.ok(mapPolicy.includes("frame-src 'none';"));
  const scriptRule = mapPolicy.split(";").find((part: string) => part.trim().startsWith("script-src "))!;
  assert.doesNotMatch(scriptRule, /unsafe-inline|unsafe-eval|\*/);
  const map = readFileSync("../web/public/media/World_Map_Vns.html", "utf8");
  const scripts = [...map.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, script] of scripts) {
    assert.ok(scriptRule.includes(`'sha256-${createHash("sha256").update(script).digest("base64")}'`));
  }
  for (const url of ["https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js", "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm", "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"]) {
    assert.ok(map.includes(url));
    assert.ok(mapPolicy.includes(url));
  }
  assert.doesNotMatch(mapPolicy, /https?:\/\/\*|script-src[^;]*unsafe-inline/);
  assert.equal(config.headers.some((rule: { headers: { key: string }[] }) => rule.headers.some(header => header.key === "Content-Security-Policy")), false, "remains report-only, not silently enforced");
});

test("static map stays ready and redraws when testimonial layout resets the canvas", () => {
  const map = readFileSync("../web/public/media/World_Map_Vns.html", "utf8");
  const staticBranch = map.match(/if \(STATIC\) \{([\s\S]*?)\n  \}/)![1];
  const relayout = map.match(/window\.__landingMapRelayout = \(\) => \{([\s\S]*?)\n  \};/)![1];
  const state = { __landingMapReadySent: false };
  let pixels = 0;
  let layouts = 0;
  const drawCompletedState = () => { pixels = 1; };
  const relayoutCanvas = () => { pixels = 0; };
  const broadcastPinLayout = () => { layouts += 1; };
  const project = () => undefined;
  new Function("window", "drawCompletedState", "notifyMapReady", staticBranch)(state, drawCompletedState, () => undefined);
  assert.equal(state.__landingMapReadySent, true);
  assert.equal(pixels, 1);
  const update = new Function("window", "relayoutCanvas", "drawCompletedState", "broadcastPinLayout", "project", relayout);
  for (let i = 0; i < 3; i++) update(state, relayoutCanvas, drawCompletedState, broadcastPinLayout, project);
  assert.equal(pixels, 1, "map restored after each canvas reset");
  assert.equal(layouts, 3, "testimonial pins relaid out after each redraw");
});
