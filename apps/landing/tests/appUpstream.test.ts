import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUpstreamUrl,
  decideAppProxy,
  resolveAppUpstream,
} from "../lib/appUpstream.ts";

// Synthetic local-only map: injected into the pure functions so routing is
// tested without editing or contacting the real origin constants.
const SYNTHETIC: Record<string, string> = {
  main: "http://127.0.0.1:4190",
  staging: "http://127.0.0.1:4191",
};

test("main resolves to the production app deployment", () => {
  assert.equal(
    resolveAppUpstream("main"),
    "https://alumni-drtry.vercel.app",
  );
});

test("staging resolves to the staging app deployment, never production", () => {
  const upstream = resolveAppUpstream("staging");
  assert.equal(
    upstream,
    "https://alumni-drt-git-8ee05f-shahaaryanmilanmst20-iitbhuacins-projects.vercel.app",
  );
  assert.notEqual(upstream, resolveAppUpstream("main"));
});

test("unknown branches fail closed with no upstream", () => {
  for (const branch of ["dev", "feature/x", "MAIN", "Main", "production", ""]) {
    assert.equal(resolveAppUpstream(branch), null, `branch: ${branch}`);
  }
});

test("a missing branch value fails closed with no upstream", () => {
  assert.equal(resolveAppUpstream(undefined), null);
  assert.equal(resolveAppUpstream(null), null);
});

test("inherited Object.prototype names fail closed, never resolve", () => {
  for (const branch of [
    "__proto__",
    "constructor",
    "toString",
    "toLocaleString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "prototype",
    "__defineGetter__",
    "__lookupGetter__",
  ]) {
    assert.equal(resolveAppUpstream(branch), null, `branch: ${branch}`);
    assert.equal(
      resolveAppUpstream(branch, SYNTHETIC),
      null,
      `synthetic branch: ${branch}`,
    );
  }
});

test("committed constants are real https origins, never local test addresses", () => {
  for (const branch of ["main", "staging"]) {
    const upstream = resolveAppUpstream(branch);
    assert.ok(upstream, `branch: ${branch}`);
    assert.match(upstream as string, /^https:\/\/[a-z0-9-]+[a-z0-9.-]*\.vercel\.app$/, `branch: ${branch}`);
    assert.doesNotMatch(upstream as string, /localhost|127\.0\.0\.1|0\.0\.0\.0/, `branch: ${branch}`);
  }
});

test("an injected synthetic map resolves without touching real constants", () => {
  assert.equal(resolveAppUpstream("main", SYNTHETIC), "http://127.0.0.1:4190");
  assert.equal(resolveAppUpstream("staging", SYNTHETIC), "http://127.0.0.1:4191");
  assert.equal(resolveAppUpstream("dev", SYNTHETIC), null);
});

test("buildUpstreamUrl preserves the full path and query string", () => {
  assert.equal(
    buildUpstreamUrl("https://u.example", "/app/login", "?next=%2Fhome"),
    "https://u.example/app/login?next=%2Fhome",
  );
  assert.equal(buildUpstreamUrl("https://u.example", "/v1", ""), "https://u.example/v1");
  assert.equal(buildUpstreamUrl("https://u.example", "/app", ""), "https://u.example/app");
});

test("decideAppProxy rewrites known branches to their own upstream only", () => {
  assert.deepEqual(
    decideAppProxy("main", "/app/login", "?a=b", SYNTHETIC),
    { type: "rewrite", url: "http://127.0.0.1:4190/app/login?a=b" },
  );
  assert.deepEqual(
    decideAppProxy("staging", "/v1", "", SYNTHETIC),
    { type: "rewrite", url: "http://127.0.0.1:4191/v1" },
  );
  assert.deepEqual(
    decideAppProxy("staging", "/app", "", SYNTHETIC),
    { type: "rewrite", url: "http://127.0.0.1:4191/app" },
  );
});

test("decideAppProxy fails closed for unknown, missing, and inherited names", () => {
  for (const branch of ["dev", "", "constructor", "__proto__", undefined, null]) {
    assert.deepEqual(
      decideAppProxy(branch, "/v1/x", "?y=2", SYNTHETIC),
      { type: "not-found" },
      `branch: ${String(branch)}`,
    );
  }
});
