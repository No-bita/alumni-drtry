import { describe, expect, it } from "vitest";
import { environmentBoolean } from "./environmentBoolean.js";

describe("environmentBoolean", () => {
  it.each(["false", "0", " FALSE ", false])("keeps %s disabled", (input) => {
    expect(environmentBoolean.parse(input)).toBe(false);
  });
  it.each(["true", "1", " TRUE ", true])("enables explicit %s", (input) => {
    expect(environmentBoolean.parse(input)).toBe(true);
  });
  it.each(["", "yes", "no", "garbage", 1, 0, null])("rejects ambiguous %s", (input) => {
    expect(environmentBoolean.safeParse(input).success).toBe(false);
  });
  it("preserves missing-value defaults", () => {
    expect(environmentBoolean.default(false).parse(undefined)).toBe(false);
    expect(environmentBoolean.default(true).parse(undefined)).toBe(true);
  });
});
