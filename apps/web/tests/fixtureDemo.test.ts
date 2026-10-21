import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Me, MeProfileResponse, ProfileResponse, SearchResult } from "../src/api/client";
import {
  FIXTURE_DEMO_ALUMNI,
  FIXTURE_DEMO_PERSON,
  activateFixtureDemoSession,
  deactivateFixtureDemoSession,
  handleFixtureDemoRequest,
  isFixtureDemoSessionActive,
} from "../src/lib/fixtureDemo";
import { api } from "../src/api/client";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  deactivateFixtureDemoSession();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("fixture demo session flag", () => {
  it("is inactive by default and tab-scoped", () => {
    expect(isFixtureDemoSessionActive()).toBe(false);
    activateFixtureDemoSession();
    expect(isFixtureDemoSessionActive()).toBe(true);
    deactivateFixtureDemoSession();
    expect(isFixtureDemoSessionActive()).toBe(false);
  });
});

describe("handleFixtureDemoRequest", () => {
  it("serves the synthetic demo person for /v1/me", () => {
    const res = handleFixtureDemoRequest<Me>("/v1/me", "GET");
    expect(res?.data?.person.isDemo).toBe(true);
    expect(res?.data?.person.personId).toBe(FIXTURE_DEMO_PERSON.personId);
  });

  it("serves a completed synthetic own-profile", () => {
    const res = handleFixtureDemoRequest<MeProfileResponse>("/v1/me/profile", "GET");
    expect(res?.data?.profile.profileCompletedAt).not.toBeNull();
    expect(res?.data?.profile.onboardingCompletedAt).not.toBeNull();
  });

  it("never returns real-looking data: every fixture alum is synthetic", () => {
    for (const a of FIXTURE_DEMO_ALUMNI) {
      expect(a.card.id).toMatch(/^demo-/);
      expect(a.profile.id).toBe(a.card.id);
    }
  });

  it("returns all fixture alumni for an unfiltered directory search", () => {
    const res = handleFixtureDemoRequest<SearchResult>("/v1/search", "GET");
    expect(res?.data?.results).toHaveLength(FIXTURE_DEMO_ALUMNI.length);
    expect(res?.data?.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  it("filters the directory by residence city (the Bengaluru tour stop)", () => {
    const res = handleFixtureDemoRequest<SearchResult>("/v1/search?residenceCity=Bengaluru", "GET");
    expect(res?.data?.results.length).toBeGreaterThan(0);
    for (const r of res?.data?.results ?? []) {
      expect(r.residenceCity).toBe("Bengaluru");
    }
  });

  it("filters the directory by a free-text query", () => {
    const res = handleFixtureDemoRequest<SearchResult>("/v1/search?q=ventures", "GET");
    expect(res?.data?.results.map((r) => r.id)).toEqual(["demo-vikram-sethi"]);
  });

  it("returns an empty result set, not an error, when nothing matches", () => {
    const res = handleFixtureDemoRequest<SearchResult>("/v1/search?q=zzzz-no-such-person", "GET");
    expect(res?.data?.results).toEqual([]);
    expect(res?.error).toBeUndefined();
  });

  it("serves a full profile for a known fixture id", () => {
    const res = handleFixtureDemoRequest<ProfileResponse>("/v1/profiles/demo-aarav-khandelwal", "GET");
    expect(res?.data?.profile.fullName).toBe("Aarav Khandelwal");
    expect(res?.data?.occupations.some((o) => o.isCurrent)).toBe(true);
  });

  it("404s an unknown profile id", () => {
    const res = handleFixtureDemoRequest<ProfileResponse>("/v1/profiles/not-a-fixture", "GET");
    expect(res?.status).toBe(404);
    expect(res?.error?.code).toBe("NOT_FOUND");
  });

  it("aggregates residence cities from the fixtures", () => {
    const res = handleFixtureDemoRequest<{ cities: { city: string; count: number }[] }>(
      "/v1/directory/residence-cities?limit=6",
      "GET"
    );
    const bengaluru = res?.data?.cities.find((c) => c.city === "Bengaluru");
    const expected = FIXTURE_DEMO_ALUMNI.filter((a) => a.card.residenceCity === "Bengaluru").length;
    expect(bengaluru?.count).toBe(expected);
    expect(res?.data?.cities[0]?.city).toBe("Bengaluru");
  });

  it("returns honest empty states for notifications, threads, inbox, links, digest", () => {
    expect(handleFixtureDemoRequest("/v1/notifications/summary", "GET")?.data).toEqual({ count: 0 });
    expect(handleFixtureDemoRequest("/v1/notifications", "GET")?.data).toEqual({ items: [] });
    expect(handleFixtureDemoRequest("/v1/connection-threads", "GET")?.data).toEqual({ threads: [] });
    expect(handleFixtureDemoRequest("/v1/contact-requests/inbox", "GET")?.data).toEqual({ requests: [] });
    expect(handleFixtureDemoRequest("/v1/me/links", "GET")?.data).toEqual({ links: [] });
    expect(handleFixtureDemoRequest("/v1/campus-monthly/current", "GET")?.data).toEqual({ issue: null });
  });

  it("blocks writes with the server-shaped 403 DEMO_READ_ONLY", () => {
    const res = handleFixtureDemoRequest("/v1/intentcasts", "POST");
    expect(res?.status).toBe(403);
    expect(res?.error?.code).toBe("DEMO_READ_ONLY");
  });

  it("lets real auth endpoints (except logout) pass through to the network", () => {
    expect(handleFixtureDemoRequest("/v1/auth/request-otp", "POST")).toBeNull();
    expect(handleFixtureDemoRequest("/v1/auth/demo/config", "GET")).toBeNull();
  });

  it("treats logout as leaving the demo: clears the session flag and succeeds", () => {
    activateFixtureDemoSession();
    const res = handleFixtureDemoRequest("/v1/auth/logout", "POST");
    expect(res?.data).toEqual({});
    expect(isFixtureDemoSessionActive()).toBe(false);
  });
});

describe("api client interception", () => {
  it("answers from fixtures without touching the network when the session is active", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    activateFixtureDemoSession();
    const res = await api.get<Me>("/v1/me");
    expect(res.data?.person.isDemo).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not intercept when the session is inactive", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network off"));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await api.get<Me>("/v1/me");
    expect(res.error?.code).toBe("NETWORK_ERROR");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("isFixtureDemoPageEnabled flag", () => {
  async function load() {
    vi.resetModules();
    return (await import("../src/lib/fixtureDemo")).isFixtureDemoPageEnabled;
  }

  it("is off in a production build by default", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENABLE_DEMO_MODE", "");
    expect(await load()).toBe(false);
  });

  it("can be switched on explicitly", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENABLE_DEMO_MODE", "true");
    expect(await load()).toBe(true);
  });

  it("is on in dev", async () => {
    vi.stubEnv("DEV", true);
    expect(await load()).toBe(true);
  });
});

describe("city board sample rows in the fixture demo", () => {
  async function load() {
    vi.resetModules();
    return await import("../src/constants/citiesSupport");
  }

  it("serves sample needs and events only while the fixture session is active", async () => {
    vi.stubEnv("DEV", false);
    const mod = await load();
    expect(mod.cityBoardSeedNeeds()).toEqual([]);
    expect(mod.cityBoardSeedEvents()).toEqual([]);
    activateFixtureDemoSession();
    expect(mod.cityBoardSeedNeeds().length).toBeGreaterThan(0);
    expect(mod.cityBoardSeedEvents().length).toBeGreaterThan(0);
    deactivateFixtureDemoSession();
    expect(mod.cityBoardSeedNeeds()).toEqual([]);
  });

  it("sample board rows include the Bengaluru tour city and unique ids", async () => {
    const mod = await load();
    activateFixtureDemoSession();
    const needs = mod.cityBoardSeedNeeds();
    expect(needs.some((n) => n.city === "Bengaluru")).toBe(true);
    expect(new Set(needs.map((n) => n.id)).size).toBe(needs.length);
  });
});
