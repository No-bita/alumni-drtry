// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cityDraftsKey, loadCityDrafts, saveCityDrafts } from "../src/lib/cityDraftStorage";

afterEach(() => window.localStorage.clear());

describe("city draft storage", () => {
  it("round-trips drafts per person and kind", () => {
    saveCityDrafts("p1", "needs", [{ id: "need-local-1", title: "Room" }]);
    expect(loadCityDrafts("p1", "needs")).toEqual([{ id: "need-local-1", title: "Room" }]);
    expect(loadCityDrafts("p2", "needs")).toEqual([]);
    expect(loadCityDrafts("p1", "events")).toEqual([]);
  });
  it("clears the key when there is nothing left", () => {
    saveCityDrafts("p1", "events", [{ id: "e1" }]);
    saveCityDrafts("p1", "events", []);
    expect(window.localStorage.getItem(cityDraftsKey("p1", "events"))).toBeNull();
  });
  it("ignores corrupt or wrong-shaped data", () => {
    window.localStorage.setItem(cityDraftsKey("p1", "needs"), "{not json");
    expect(loadCityDrafts("p1", "needs")).toEqual([]);
    window.localStorage.setItem(cityDraftsKey("p1", "needs"), JSON.stringify({ id: "x" }));
    expect(loadCityDrafts("p1", "needs")).toEqual([]);
    window.localStorage.setItem(cityDraftsKey("p1", "needs"), JSON.stringify([{ id: "ok" }, 5, null, { title: "no id" }]));
    expect(loadCityDrafts("p1", "needs")).toEqual([{ id: "ok" }]);
  });
  it("does not throw when storage is unavailable", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => saveCityDrafts("p1", "needs", [{ id: "a" }])).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
