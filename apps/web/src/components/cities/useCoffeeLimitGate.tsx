import { useState, type ReactNode } from "react";
import {
  canSelectMoreOpenTo,
  coffeeLimitOf,
  toggleOpenToSelection,
  withCoffeeLimit,
  type OpenToOptionId,
  type OpenToPreferences,
} from "../../lib/openToPreferences";
import { CoffeeLimitSheet } from "./CoffeeLimitSheet";

/**
 * Wraps an open-to editor's toggle: turning coffee ON first asks for a weekly limit (screen 4).
 * "Not now" leaves coffee off. Every other tag toggles as before.
 */
export function useCoffeeLimitGate(
  prefs: OpenToPreferences,
  onChange: (next: OpenToPreferences) => void,
): { toggle: (id: OpenToOptionId) => void; changeLimit: () => void; sheet: ReactNode } {
  const [open, setOpen] = useState(false);

  const toggle = (id: OpenToOptionId) => {
    if (id === "coffee" && !prefs.selected.includes("coffee")) {
      if (!canSelectMoreOpenTo(prefs)) return;
      setOpen(true);
      return;
    }
    onChange(toggleOpenToSelection(prefs, id));
  };

  const sheet = open ? (
    <CoffeeLimitSheet
      initial={coffeeLimitOf(prefs)}
      onConfirm={(limit) => {
        onChange(withCoffeeLimit(prefs, limit));
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  ) : null;

  return { toggle, changeLimit: () => setOpen(true), sheet };
}
