import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKLIST_WINDOW_DAYS,
  checklistSteps,
  doneCount,
  isNewEnough,
  readFlag,
  writeFlag,
} from "../src/lib/onboardingChecklist";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("checklist flags", () => {
  it("are false until written, and scoped per person and name", () => {
    expect(readFlag("p1", "city")).toBe(false);
    writeFlag("p1", "city");
    expect(readFlag("p1", "city")).toBe(true);
    expect(readFlag("p2", "city")).toBe(false);
    expect(readFlag("p1", "message")).toBe(false);
    expect(window.localStorage.getItem("alma.checklist.p1.city")).toBe("1");
  });
  it("survive broken storage without throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(readFlag("p1", "city")).toBe(false);
    expect(() => writeFlag("p1", "city")).not.toThrow();
  });
});

describe("isNewEnough", () => {
  const now = Date.parse("2026-03-20T00:00:00Z");
  it("keeps accounts up to the window and drops older ones", () => {
    const day = 86_400_000;
    expect(isNewEnough(new Date(now - (CHECKLIST_WINDOW_DAYS * day)).toISOString(), now)).toBe(true);
    expect(isNewEnough(new Date(now - (CHECKLIST_WINDOW_DAYS * day + 1000)).toISOString(), now)).toBe(false);
    expect(isNewEnough(new Date(now).toISOString(), now)).toBe(true);
  });
  it("hides the checklist when the date is unreadable", () => {
    expect(isNewEnough("not a date", now)).toBe(false);
    expect(isNewEnough("", now)).toBe(false);
  });
});

describe("checklistSteps", () => {
  const profile = { batchYear: 2022, residenceCity: "Pune", createdAt: "2026-03-19T00:00:00Z" };
  it("needs both batch year and city for the profile step", () => {
    expect(checklistSteps({ profile: { ...profile, batchYear: null }, hasThreads: false, cityVisited: false }).profile).toBe(false);
    expect(checklistSteps({ profile: { ...profile, residenceCity: null }, hasThreads: false, cityVisited: false }).profile).toBe(false);
    expect(checklistSteps({ profile, hasThreads: false, cityVisited: false }).profile).toBe(true);
  });
  it("counts each step independently", () => {
    expect(doneCount({ profile: false, city: true, message: false })).toBe(1);
    expect(doneCount({ profile: false, city: false, message: false })).toBe(0);
    expect(doneCount({ profile: true, city: true, message: true })).toBe(3);
  });
});
