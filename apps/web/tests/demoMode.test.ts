import { describe, expect, it } from "vitest";
import {
  DEMO_TOUR_STOPS,
  DEMO_TOUR_STORAGE_KEY,
  clampStep,
  demoLandingPath,
  demoStartStep,
  isDemoBlockedResponse,
  isDemoPerson,
  readDemoTourState,
  writeDemoTourState,
} from "../src/lib/demoMode";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

describe("demoMode", () => {
  it("treats only an explicit server flag as demo", () => {
    expect(isDemoPerson({ isDemo: true })).toBe(true);
    expect(isDemoPerson({ isDemo: false })).toBe(false);
    expect(isDemoPerson({})).toBe(false);
    expect(isDemoPerson(null)).toBe(false);
  });

  it("recognises demo-blocked responses only for 403 DEMO_* codes", () => {
    expect(isDemoBlockedResponse(403, "DEMO_READ_ONLY")).toBe(true);
    expect(isDemoBlockedResponse(403, "AUTH_FORBIDDEN")).toBe(false);
    expect(isDemoBlockedResponse(401, "DEMO_READ_ONLY")).toBe(false);
    expect(isDemoBlockedResponse(403, undefined)).toBe(false);
  });

  it("clamps tour steps into range", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(DEMO_TOUR_STOPS.length - 1);
    expect(clampStep(Number.NaN)).toBe(0);
  });

  it("round-trips tour progress and ignores junk", () => {
    const s = fakeStorage();
    expect(readDemoTourState(s)).toBeNull();
    writeDemoTourState(s, { status: "active", step: 2 });
    expect(readDemoTourState(s)).toEqual({ status: "active", step: 2 });
    s.data[DEMO_TOUR_STORAGE_KEY] = "not json";
    expect(readDemoTourState(s)).toBeNull();
    s.data[DEMO_TOUR_STORAGE_KEY] = JSON.stringify({ status: "weird", step: 1 });
    expect(readDemoTourState(s)).toBeNull();
  });

  it("lands on the directory by default and honours a known tour start", () => {
    expect(demoLandingPath()).toBe("/search");
    expect(demoLandingPath({ start: "city" })).toBe("/intent/location/bengaluru");
    expect(demoLandingPath({ start: "nonsense" })).toBe("/search");
    expect(demoStartStep("city")).toBe(2);
    expect(demoStartStep("nonsense")).toBe(0);
    expect(demoStartStep(undefined)).toBe(0);
  });
});
