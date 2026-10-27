import { describe, expect, it } from "vitest";
import { deliveryOf, formatCountdown, resendAfterMs, resendNotice } from "../src/lib/authStartDelivery";

describe("auth start delivery", () => {
  it("defaults older API answers to a normal send with the 2-minute window", () => {
    expect(deliveryOf({ challengeId: "c" })).toBe("sent");
    expect(deliveryOf({ challengeId: "c", delivery: "bogus" as never })).toBe("sent");
    expect(resendAfterMs({ challengeId: "c" })).toBe(120_000);
    expect(resendAfterMs({ challengeId: "c", resendAfterSeconds: 37 })).toBe(37_000);
  });
  it("formats the countdown", () => {
    expect(formatCountdown(120_000)).toBe("2:00");
    expect(formatCountdown(101_200)).toBe("1:42");
    expect(formatCountdown(-5)).toBe("0:00");
  });
  it("never claims a new email when none was sent", () => {
    expect(resendNotice("already_sent")).not.toMatch(/New code/);
    expect(resendNotice("sent")).toBe("New code sent. Earlier codes no longer work.");
  });
});
