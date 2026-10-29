import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { OnboardingAnswerKey } from "../src/components/onboarding/OnboardingAnswerKey";
import {
  coffeeLimitOf,
  coffeeNeedsLimit,
  normalizeOpenToPreferences,
  parseOpenToPreferences,
  toggleOpenToSelection,
  type OpenToPreferences,
} from "../src/lib/openToPreferences";

afterEach(cleanup);

function Harness({ start, onValue }: { start: OpenToPreferences; onValue: (v: OpenToPreferences) => void }) {
  const [v, setV] = useState(start);
  return (
    <OnboardingAnswerKey
      value={v}
      onChange={(next) => {
        setV(next);
        onValue(next);
      }}
    />
  );
}

describe("Coffee weekly limit (screen 4)", () => {
  it("turning coffee on asks for a limit (default 2) and saves it with the tag", () => {
    let last: OpenToPreferences | null = null;
    render(<Harness start={{ selected: [], descriptions: {} }} onValue={(v) => (last = v)} />);
    fireEvent.click(screen.getByRole("button", { name: /Coffee chats/ }));
    const dialog = screen.getByRole("dialog", { name: "Open to coffee" });
    expect(within(dialog).getByRole("radio", { name: "2" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("radio", { name: "3" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn on coffee · 3 a week" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(last!.selected).toEqual(["coffee"]);
    expect(last!.limits).toEqual({ coffee: 3 });
  });

  it("Not now leaves coffee off", () => {
    let last: OpenToPreferences | null = null;
    render(<Harness start={{ selected: [], descriptions: {} }} onValue={(v) => (last = v)} />);
    fireEvent.click(screen.getByRole("button", { name: /Coffee chats/ }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(last).toBeNull();
    expect(screen.getByRole("button", { name: /Coffee chats/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("limits survive parse/normalize, go when coffee goes, and legacy coffee reads as 2", () => {
    const parsed = parseOpenToPreferences({ selected: ["coffee", "mentorship"], descriptions: {}, limits: { coffee: 5 } })!;
    expect(parsed.limits).toEqual({ coffee: 5 });
    expect(normalizeOpenToPreferences(parsed).limits).toEqual({ coffee: 5 });
    expect(toggleOpenToSelection(parsed, "coffee").limits).toBeUndefined();
    expect(parseOpenToPreferences({ selected: ["coffee"], descriptions: {}, limits: { coffee: 99 } })!.limits).toBeUndefined();
    const legacy = parseOpenToPreferences({ selected: ["coffee"], descriptions: {} })!;
    expect(coffeeLimitOf(legacy)).toBe(2);
    expect(coffeeNeedsLimit(legacy)).toBe(true);
  });
});
