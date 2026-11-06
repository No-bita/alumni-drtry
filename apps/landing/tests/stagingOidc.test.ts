import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAppUpstream } from "../lib/appUpstream.ts";
import { isReviewedStagingTarget, prepareStagingOidc, stripDeploymentCredentials, TRUSTED_OIDC_HEADER } from "../lib/stagingOidc.ts";
const origin = resolveAppUpstream("staging")!;
const fake = "mock-only-not-a-real-token";

test("only staging branch in preview may prepare credentials", async () => {
  for (const [branch, env] of [["main", "production"], ["staging", "production"], ["main", "preview"], ["staging", undefined], [undefined, "preview"], ["constructor", "preview"], ["feature/x", "preview"]]) {
    let calls = 0;
    assert.deepEqual(await prepareStagingOidc(branch, env, origin + "/app", new Headers(), async () => { calls++; return fake; }), { type: "unavailable" });
    assert.equal(calls, 0);
  }
});

test("exact reviewed HTTPS origin and path boundary only", () => {
  for (const url of [origin + "/app", origin + "/app/assets/a.js?q=1", origin + "/v1", origin + "/v1/auth/session"]) assert.equal(isReviewedStagingTarget("staging", "preview", url), true);
  for (const url of ["https://alma-staging.onrender.com/v1/x", resolveAppUpstream("main")! + "/app", origin + ".evil.example/app", origin.replace("https:", "http:") + "/app", origin + "/application", origin + "/v10", origin + "/app/../../other", origin + "/app#x", origin.replace("https://", "https://user:pass@") + "/app", origin + "/app?x-vercel-protection-bypass=spoof", "//evil.example/app", "bad"]) assert.equal(isReviewedStagingTarget("staging", "preview", url), false, url);
});

test("inbound credentials are removed case-insensitively without mutating input", () => {
  const input = new Headers({ "X-Vercel-Trusted-Oidc-Idp-Token": "spoof", "X-Vercel-Oidc-Token": "spoof2", "x-vercel-protection-bypass": "spoof3", "x-vercel-set-bypass-cookie": "true", cookie: "session=mock", authorization: "Bearer user-session", "content-type": "application/json", "x-middleware-request-x-vercel-trusted-oidc-idp-token": "spoof4", "x-middleware-override-headers": "cookie" });
  const clean = stripDeploymentCredentials(input);
  for (const name of [TRUSTED_OIDC_HEADER, "x-vercel-oidc-token", "x-vercel-protection-bypass", "x-vercel-set-bypass-cookie"]) assert.equal(clean.has(name), false);
  assert.equal(clean.get("cookie"), "session=mock"); assert.equal(clean.get("authorization"), "Bearer user-session"); assert.equal(clean.get("content-type"), "application/json");
  assert.equal(clean.has("x-middleware-request-x-vercel-trusted-oidc-idp-token"), false);
  assert.equal(clean.has("x-middleware-override-headers"), false);
  assert.equal(input.get(TRUSTED_OIDC_HEADER), "spoof");
});

test("only provider's mock token is attached, never spoofed inbound token", async () => {
  const result = await prepareStagingOidc("staging", "preview", origin + "/app", new Headers({[TRUSTED_OIDC_HEADER]: "spoof"}), async () => fake);
  assert.equal(result.type, "ready");
  if (result.type === "ready") assert.equal(result.upstreamHeaders.get(TRUSTED_OIDC_HEADER), fake);
});

test("missing, malformed, and throwing provider fail closed with generic output", async () => {
  for (const provider of [async () => "", async () => "bad\r\nheader", async () => { throw new Error("private mocked error"); }]) assert.deepEqual(await prepareStagingOidc("staging", "preview", origin + "/v1/x", new Headers(), provider), {type:"unavailable"});
});
