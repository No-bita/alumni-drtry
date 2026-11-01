/** Must match apps/api `OPEN_TO_MAX_SELECTED`. */
export const OPEN_TO_MAX_SELECTED = 5;

export const OPEN_TO_OPTION_IDS = [
  "referrals",
  "coffee",
  "mentorship",
  "hiring",
  "advising",
  "speaking",
  "intros",
  "collaboration",
  "city_help",
  "study_advice",
] as const;

export type OpenToOptionId = (typeof OPEN_TO_OPTION_IDS)[number];

/** Coffee asks a week the member is happy to get (Cities v1). There is no "unlimited". */
export const COFFEE_LIMIT_OPTIONS = [1, 2, 3, 5] as const;
export type CoffeeLimit = (typeof COFFEE_LIMIT_OPTIONS)[number];
export const COFFEE_LIMIT_DEFAULT: CoffeeLimit = 2;

export type OpenToPreferences = {
  /** Up to OPEN_TO_MAX_SELECTED option ids, in display order. */
  selected: OpenToOptionId[];
  descriptions: Partial<Record<OpenToOptionId, string>>;
  /** Per-tag limits. Only `coffee` today; kept only while coffee is selected. */
  limits?: { coffee?: CoffeeLimit };
};

export function isCoffeeLimit(value: unknown): value is CoffeeLimit {
  return typeof value === "number" && (COFFEE_LIMIT_OPTIONS as readonly number[]).includes(value);
}

/** The coffee limit to show: the saved one, or 2 for members who turned coffee on before limits existed. */
export function coffeeLimitOf(prefs: OpenToPreferences | null | undefined): CoffeeLimit | null {
  if (!prefs || !prefs.selected.includes("coffee")) return null;
  return prefs.limits?.coffee ?? COFFEE_LIMIT_DEFAULT;
}

/** Coffee is on but no limit was ever chosen (legacy): show the limit sheet once. */
export function coffeeNeedsLimit(prefs: OpenToPreferences | null | undefined): boolean {
  return Boolean(prefs && prefs.selected.includes("coffee") && !prefs.limits?.coffee);
}

/** Turn coffee on with a weekly limit (or just change the limit). */
export function withCoffeeLimit(prefs: OpenToPreferences, limit: CoffeeLimit): OpenToPreferences {
  const on = prefs.selected.includes("coffee") ? prefs : toggleOpenToSelection(prefs, "coffee");
  if (!on.selected.includes("coffee")) return prefs;
  return { ...on, limits: { ...(on.limits ?? {}), coffee: limit } };
}

export type OpenToCatalogEntry = {
  title: string;
  defaultDescription: string;
  icon: OpenToOptionId;
};

export const OPEN_TO_CATALOG: Record<OpenToOptionId, OpenToCatalogEntry> = {
  referrals: {
    title: "Referrals",
    defaultDescription: "Happy to refer for relevant roles",
    icon: "referrals",
  },
  coffee: {
    title: "Coffee chats",
    defaultDescription: "Open for casual conversations",
    icon: "coffee",
  },
  mentorship: {
    title: "Mentorship",
    defaultDescription: "Happy to mentor and guide",
    icon: "mentorship",
  },
  hiring: {
    title: "Hiring help",
    defaultDescription: "Can help hire or refer candidates to my team",
    icon: "hiring",
  },
  advising: {
    title: "Advising",
    defaultDescription: "Open to advising startups or side projects",
    icon: "advising",
  },
  speaking: {
    title: "Speaking",
    defaultDescription: "Available for panels, talks, or campus sessions",
    icon: "speaking",
  },
  intros: {
    title: "Introductions",
    defaultDescription: "Happy to make warm intros in my network",
    icon: "intros",
  },
  collaboration: {
    title: "Collaboration",
    defaultDescription: "Interested in research or project collaborations",
    icon: "collaboration",
  },
  city_help: {
    title: "Settling into my city",
    defaultDescription: "Happy to help newcomers settle into my city",
    icon: "city_help",
  },
  study_advice: {
    title: "Higher-studies advice",
    defaultDescription: "Happy to advise on MS, MBA or PhD plans",
    icon: "study_advice",
  },
};

export type OpenToDisplayItem = {
  id: OpenToOptionId;
  title: string;
  description: string;
  icon: OpenToOptionId;
};

function isOpenToOptionId(value: string): value is OpenToOptionId {
  return (OPEN_TO_OPTION_IDS as readonly string[]).includes(value);
}

function isLegacyEntry(value: unknown): value is { enabled: boolean; description?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { enabled?: unknown }).enabled === "boolean"
  );
}

function parseLegacyRecord(raw: Record<string, unknown>): OpenToPreferences | null {
  const selected: OpenToOptionId[] = [];
  const descriptions: Partial<Record<OpenToOptionId, string>> = {};

  for (const id of OPEN_TO_OPTION_IDS) {
    const entry = raw[id];
    if (!isLegacyEntry(entry) || !entry.enabled) continue;
    selected.push(id);
    const description = typeof entry.description === "string" ? entry.description.trim() : "";
    if (description) descriptions[id] = description;
  }

  if (selected.length === 0) return null;
  return normalizeOpenToPreferences({ selected, descriptions });
}

export function createEmptyOpenToPreferences(): OpenToPreferences {
  return { selected: [], descriptions: {} };
}

export function parseOpenToPreferences(raw: unknown): OpenToPreferences | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.selected)) {
    const selected: OpenToOptionId[] = [];
    for (const item of obj.selected) {
      if (typeof item === "string" && isOpenToOptionId(item) && !selected.includes(item)) {
        selected.push(item);
      }
    }
    const descriptions: Partial<Record<OpenToOptionId, string>> = {};
    if (obj.descriptions && typeof obj.descriptions === "object" && !Array.isArray(obj.descriptions)) {
      for (const [key, value] of Object.entries(obj.descriptions)) {
        if (isOpenToOptionId(key) && typeof value === "string") {
          descriptions[key] = value.trim();
        }
      }
    }
    if (selected.length === 0) return null;
    const rawLimits = obj.limits && typeof obj.limits === "object" && !Array.isArray(obj.limits)
      ? (obj.limits as Record<string, unknown>)
      : null;
    const limits = rawLimits && isCoffeeLimit(rawLimits.coffee) ? { coffee: rawLimits.coffee } : undefined;
    return normalizeOpenToPreferences({ selected, descriptions, ...(limits ? { limits } : {}) });
  }

  return parseLegacyRecord(obj);
}

export function normalizeOpenToPreferences(input: OpenToPreferences): OpenToPreferences {
  const selected: OpenToOptionId[] = [];
  for (const id of input.selected) {
    if (!isOpenToOptionId(id) || selected.includes(id)) continue;
    if (selected.length >= OPEN_TO_MAX_SELECTED) break;
    selected.push(id);
  }

  const descriptions: Partial<Record<OpenToOptionId, string>> = {};
  for (const id of selected) {
    const raw = input.descriptions[id]?.trim() ?? "";
    const fallback = OPEN_TO_CATALOG[id].defaultDescription;
    descriptions[id] = (raw || fallback).slice(0, 500);
  }

  const coffee = selected.includes("coffee") && isCoffeeLimit(input.limits?.coffee) ? input.limits!.coffee : undefined;
  return coffee ? { selected, descriptions, limits: { coffee } } : { selected, descriptions };
}

export function openToPreferencesForEdit(
  saved: OpenToPreferences | null | undefined,
): OpenToPreferences {
  if (!saved) return createEmptyOpenToPreferences();
  const normalized = normalizeOpenToPreferences(saved);
  return {
    selected: [...normalized.selected],
    descriptions: { ...normalized.descriptions },
    ...(normalized.limits ? { limits: { ...normalized.limits } } : {}),
  };
}

export function isOpenToSelected(prefs: OpenToPreferences, id: OpenToOptionId): boolean {
  return prefs.selected.includes(id);
}

export function canSelectMoreOpenTo(prefs: OpenToPreferences): boolean {
  return prefs.selected.length < OPEN_TO_MAX_SELECTED;
}

export function toggleOpenToSelection(prefs: OpenToPreferences, id: OpenToOptionId): OpenToPreferences {
  if (isOpenToSelected(prefs, id)) {
    const selected = prefs.selected.filter((x) => x !== id);
    const descriptions = { ...prefs.descriptions };
    delete descriptions[id];
    const limits = id === "coffee" || !prefs.limits ? undefined : { ...prefs.limits };
    return limits && Object.keys(limits).length > 0 ? { selected, descriptions, limits } : { selected, descriptions };
  }
  if (!canSelectMoreOpenTo(prefs)) return prefs;
  const catalog = OPEN_TO_CATALOG[id];
  return {
    ...prefs,
    selected: [...prefs.selected, id],
    descriptions: {
      ...prefs.descriptions,
      [id]: prefs.descriptions[id]?.trim() || catalog.defaultDescription,
    },
  };
}

export function setOpenToDescription(
  prefs: OpenToPreferences,
  id: OpenToOptionId,
  description: string,
): OpenToPreferences {
  if (!isOpenToSelected(prefs, id)) return prefs;
  return {
    ...prefs,
    descriptions: { ...prefs.descriptions, [id]: description },
  };
}

/** Items shown on the profile Open to card (selected only, fixed titles). */
export function openToDisplayItems(saved: OpenToPreferences | null | undefined): OpenToDisplayItem[] {
  if (!saved) return [];
  const normalized = normalizeOpenToPreferences(saved);
  return normalized.selected.map((id) => {
    const catalog = OPEN_TO_CATALOG[id];
    const description =
      normalized.descriptions[id]?.trim() || catalog.defaultDescription;
    return {
      id,
      title: catalog.title,
      description,
      icon: catalog.icon,
    };
  });
}
