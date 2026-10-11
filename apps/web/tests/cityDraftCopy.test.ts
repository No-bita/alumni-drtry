import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as copy from "../src/lib/cityDraftCopy";

describe("city draft board copy", () => {
  it("is honest that items stay on this device", () => {
    for (const text of [copy.CITY_DRAFT_NOTE, copy.CITY_REQUEST_SAVED_NOTICE, copy.CITY_EVENT_SAVED_NOTICE]) {
      expect(text).toMatch(/this device/);
    }
    expect(copy.CITY_SIGNED_OUT_NOTE).toMatch(/Sign in/);
  });
  it("the page no longer claims posts are live", () => {
    const page = readFileSync("src/pages/LocationPage.tsx", "utf8");
    expect(page).not.toMatch(/Request posted\. It now appears/);
    expect(page).not.toMatch(/Event created\. It now appears/);
    expect(page).toContain("CITY_REQUEST_SAVED_NOTICE");
  });
});
