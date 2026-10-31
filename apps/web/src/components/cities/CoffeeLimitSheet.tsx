import { useState } from "react";
import { COFFEE_LIMIT_DEFAULT, COFFEE_LIMIT_OPTIONS, type CoffeeLimit } from "../../lib/openToPreferences";
import { CitySheet } from "./CitySheet";

/**
 * Screen 4: turning on "Open to coffee" sets a weekly limit (1 · 2 · 3 · 5, default 2; no "unlimited").
 * "Not now" leaves coffee as it was (off for a new toggle).
 */
export function CoffeeLimitSheet({
  initial,
  onConfirm,
  onCancel,
}: {
  initial?: CoffeeLimit | null;
  onConfirm: (limit: CoffeeLimit) => void;
  onCancel: () => void;
}) {
  const [limit, setLimit] = useState<CoffeeLimit>(initial ?? COFFEE_LIMIT_DEFAULT);
  return (
    <CitySheet title="Open to coffee" onClose={onCancel}>
      <div className="cities-sheet__body">
        <p className="cities__lede">
          Alumni in your city can ask you for coffee, with a reason. How many asks a week are you happy to get?
        </p>
        <fieldset className="cities__fieldset">
          <legend className="cities__label">Asks a week</legend>
          <div className="cities__limit-grid" role="radiogroup" aria-label="Asks a week">
            {COFFEE_LIMIT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={limit === n}
                className={`cities__limit${limit === n ? " cities__limit--on" : ""}`}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="cities__infobox">
          <p className="cities__infobox-title">How it works</p>
          <p>
            Once you’ve had {limit} {limit === 1 ? "ask" : "asks"} this week, your button shows “Full this week” until Monday. Every
            ask says why they’re reaching out, and you can decline without explaining.
          </p>
        </div>
        <button type="button" className="cities__primary" onClick={() => onConfirm(limit)}>
          Turn on coffee · {limit} a week
        </button>
        <button type="button" className="cities__textbtn cities__textbtn--center" onClick={onCancel}>
          Not now
        </button>
      </div>
    </CitySheet>
  );
}
