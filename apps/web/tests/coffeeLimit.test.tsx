import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  // Coffee came with Cities, which is out of the product: onboarding no longer offers it (the limit
  // sheet tests return with Cities). Saved coffee limits still parse below.
  it("onboarding no longer offers coffee or city help", () => {
    render(<Harness start={{ selected: [] }} onValue={() => {}} />);
    expect(screen.queryByRole("button", { name: /Coffee chats/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Settling into my city/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Referrals/ })).toBeTruthy();
  });

  it("limits survive parse/normalize, go when coffee goes, and legacy coffee reads as 2", () => {
    const parsed = parseOpenToPreferences({ selected: ["coffee", "mentorship"], limits: { coffee: 5 } })!;
    expect(parsed.limits).toEqual({ coffee: 5 });
    expect(normalizeOpenToPreferences(parsed).limits).toEqual({ coffee: 5 });
    expect(toggleOpenToSelection(parsed, "coffee").limits).toBeUndefined();
    expect(parseOpenToPreferences({ selected: ["coffee"], limits: { coffee: 99 } })!.limits).toBeUndefined();
    const legacy = parseOpenToPreferences({ selected: ["coffee"] })!;
    expect(coffeeLimitOf(legacy)).toBe(2);
    expect(coffeeNeedsLimit(legacy)).toBe(true);
  });
});
