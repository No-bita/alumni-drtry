/** Raised from 3 to 5 with the answer-key onboarding (city help + higher-studies advice tags). */
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

export type OpenToPreferenceEntry = {
  enabled: boolean;
  description: string;
};

/** Stored on `people.open_to_preferences` (JSONB). */
export type OpenToPreferences = {
  selected: OpenToOptionId[];
  descriptions: Partial<Record<OpenToOptionId, string>>;
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
  return normalizeOpenToPreferencesForStorage({ selected, descriptions });
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
    return normalizeOpenToPreferencesForStorage({ selected, descriptions });
  }

  return parseLegacyRecord(obj);
}

export function normalizeOpenToPreferencesForStorage(input: OpenToPreferences): OpenToPreferences {
  const selected: OpenToOptionId[] = [];
  for (const id of input.selected) {
    if (!isOpenToOptionId(id) || selected.includes(id)) continue;
    if (selected.length >= OPEN_TO_MAX_SELECTED) break;
    selected.push(id);
  }

  const descriptions: Partial<Record<OpenToOptionId, string>> = {};
  for (const id of selected) {
    const description = (input.descriptions[id] ?? "").trim().slice(0, 500);
    descriptions[id] = description;
  }

  return { selected, descriptions };
}
