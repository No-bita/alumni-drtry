import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { api } from "../src/api/client";
import {
  FIXTURE_DEMO_PERSON,
  FIXTURE_DEMO_PROFILE,
  activateFixtureDemoSession,
  deactivateFixtureDemoSession,
  isFixtureDemoSessionActive,
} from "../src/lib/fixtureDemo";
import {
  AUTH_SESSION_QUERY_KEY,
  endFixtureDemoAuthSession,
  fetchAuthSession,
  type AuthSessionData,
} from "../src/lib/authSessionQuery";

const fixtureSession: AuthSessionData = {
  kind: "authenticated",
  person: FIXTURE_DEMO_PERSON,
  myProfile: FIXTURE_DEMO_PROFILE,
  myProfileError: false,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  deactivateFixtureDemoSession();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("fetchAuthSession fixture race", () => {
  it("a fixture session activated mid-flight wins over a failing real /v1/me", async () => {
    const rejecters: Array<(e: Error) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejecters.push(reject);
          })
      )
    );
    const pending = fetchAuthSession(new AbortController().signal);
    activateFixtureDemoSession();
    // Both real requests (me + profile) now fail with a non-auth error.
    for (const reject of rejecters.splice(0)) reject(new Error("network off"));
    // Let the api client's retries/second call settle as failures too.
    for (let i = 0; i < 10 && rejecters.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    for (const reject of rejecters.splice(0)) reject(new Error("network off"));
    const session = await pending;
    expect(session).toEqual(fixtureSession);
  });

  it("serves the fixture session immediately when already active", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    activateFixtureDemoSession();
    const session = await fetchAuthSession(new AbortController().signal);
    expect(session).toEqual(fixtureSession);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("endFixtureDemoAuthSession", () => {
  it("clears the tab marker and the seeded fixture identity from the auth cache", () => {
    const qc = new QueryClient();
    activateFixtureDemoSession();
    qc.setQueryData(AUTH_SESSION_QUERY_KEY, fixtureSession);
    endFixtureDemoAuthSession(qc);
    expect(isFixtureDemoSessionActive()).toBe(false);
    expect(qc.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual({ kind: "unauthenticated" });
  });

  it("is a no-op for a real (non-fixture) session", () => {
    const qc = new QueryClient();
    const realSession: AuthSessionData = {
      kind: "authenticated",
      person: { ...FIXTURE_DEMO_PERSON, personId: "real-person", isDemo: false },
      myProfile: FIXTURE_DEMO_PROFILE,
      myProfileError: false,
    };
    qc.setQueryData(AUTH_SESSION_QUERY_KEY, realSession);
    endFixtureDemoAuthSession(qc);
    expect(qc.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(realSession);
  });

  it("api client logout path still exists for the Leave demo button", async () => {
    // Guard the contract Leave demo relies on: /v1/auth/logout is answered by fixtures.
    activateFixtureDemoSession();
    const res = await api.post("/v1/auth/logout");
    expect(res.error).toBeUndefined();
  });
});
