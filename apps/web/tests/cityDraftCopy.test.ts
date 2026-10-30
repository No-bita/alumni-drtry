import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as copy from "../src/lib/cityDraftCopy";

describe("city draft board copy", () => {
  it("is honest that items stay on this device", () => {
    for (const text of [copy.CITY_DRAFT_NOTE, copy.CITY_REQUEST_SAVED_NOTICE, copy.CITY_EVENT_SAVED_NOTICE]) {
      expect(text).toMatch(/this device/);
    }
  });
  it("the live Cities page does not use the retained local-draft notices", () => {
    const page = readFileSync("src/pages/LocationPage.tsx", "utf8");
    expect(page).not.toMatch(/Request posted\. It now appears/);
    expect(page).not.toMatch(/Event created\. It now appears/);
    expect(page).not.toContain("CITY_REQUEST_SAVED_NOTICE");
    expect(page).not.toContain("CITY_EVENT_SAVED_NOTICE");
    expect(page).toContain("Posted. It’s on the Wall and under Get together.");
  });
});
