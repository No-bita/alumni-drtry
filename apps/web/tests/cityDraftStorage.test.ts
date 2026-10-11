// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cityDraftsKey, loadCityDrafts, saveCityDrafts } from "../src/lib/cityDraftStorage";

afterEach(() => window.localStorage.clear());

const need = (over: Record<string, unknown> = {}) => ({
  id: "need-local-1",
  city: "Pune",
  country: "India",
  type: "housing",
  askedByName: "A",
  askedByDepartmentCode: "CSE",
  askedByBatchYear: 2020,
  title: "Room",
  description: "Near the station",
  ...over,
});
const event = (over: Record<string, unknown> = {}) => ({
  id: "event-local-1",
  city: "Pune",
  country: "India",
  title: "Cricket",
  startsAtLabel: "Sat 7 PM",
  venue: "Ground",
  attendeeCount: 0,
  ...over,
});

describe("city draft storage", () => {
  it("round-trips drafts per person and kind", () => {
    saveCityDrafts("p1", "needs", [need()]);
    expect(loadCityDrafts("p1", "needs")).toEqual([need()]);
    expect(loadCityDrafts("p2", "needs")).toEqual([]);
    expect(loadCityDrafts("p1", "events")).toEqual([]);
  });
  it("clears the key when there is nothing left", () => {
    saveCityDrafts("p1", "events", [event()]);
    saveCityDrafts("p1", "events", []);
    expect(window.localStorage.getItem(cityDraftsKey("p1", "events"))).toBeNull();
  });
  it("ignores corrupt or wrong-shaped data", () => {
    window.localStorage.setItem(cityDraftsKey("p1", "needs"), "{not json");
    expect(loadCityDrafts("p1", "needs")).toEqual([]);
    window.localStorage.setItem(cityDraftsKey("p1", "needs"), JSON.stringify({ id: "x" }));
    expect(loadCityDrafts("p1", "needs")).toEqual([]);
    window.localStorage.setItem(cityDraftsKey("p1", "needs"), JSON.stringify([need(), 5, null, { title: "no id" }]));
    expect(loadCityDrafts("p1", "needs")).toEqual([need()]);
  });
  it("drops entries missing fields the board reads, so they cannot crash it", () => {
    const { city: _c, ...noCity } = need();
    window.localStorage.setItem(
      cityDraftsKey("p1", "needs"),
      JSON.stringify([noCity, need({ type: "other" }), need({ askedByBatchYear: "2020" }), need({ id: "keep" })])
    );
    expect(loadCityDrafts("p1", "needs").map((n) => n.id)).toEqual(["keep"]);
    const { venue: _v, ...noVenue } = event();
    window.localStorage.setItem(cityDraftsKey("p1", "events"), JSON.stringify([noVenue, event({ attendeeCount: "0" }), event({ id: "ok" })]));
    expect(loadCityDrafts("p1", "events").map((n) => n.id)).toEqual(["ok"]);
  });
  it("does not throw when storage is unavailable", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => saveCityDrafts("p1", "needs", [need()])).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
