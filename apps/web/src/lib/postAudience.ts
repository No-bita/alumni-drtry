/**
 * Wall post audience (who can see a post), picked in every composer and fixed once posted.
 * The server decides visibility and fills every value from the author's profile; the page only says
 * which choices are picked.
 */

export type AudiencePart = "institution" | "batch" | "department" | "city";

/** What the composer holds. `institution: null` = all institutes (the default). */
export type AudienceChoice = {
  institution: string | null;
  batch: boolean;
  department: boolean;
  city: boolean;
  /** Explicit approved city from the page, otherwise city means the profile city. */
  cityPlaceId?: string;
};

export const EVERYONE_CHOICE: AudienceChoice = Object.freeze({
  institution: null,
  batch: false,
  department: false,
  city: false,
}) as AudienceChoice;

export type AudienceUnavailableReason =
  | "missing"
  | "pending_review"
  | "other_department"
  | "city_not_linked"
  | "city_pending";

export type AudienceOptionDetail = { available: boolean; value: string | null; reason: AudienceUnavailableReason | null };

/** GET /v1/intentcasts/audience-options */
export type AudienceOptions = {
  institutions: Array<{ key: string; name: string }>;
  ownInstitutionKey: string | null;
  batch: AudienceOptionDetail;
  department: AudienceOptionDetail;
  city: AudienceOptionDetail;
};

/** POST /v1/intentcasts/audience-preview */
export type AudiencePreview =
  | { everyone: true; label: null; size: null }
  | { everyone: false; label: string; size: "none" | "under10" | "about"; approx?: number };

/** On a post: null = Everyone. */
export type PostAudience = { label: string; parts: AudiencePart[] } | null;

export function isEveryoneChoice(c: AudienceChoice): boolean {
  return !c.institution && !c.batch && !c.department && !c.city;
}

/** Request body value: null for Everyone, else only what is picked. */
export function toApiAudience(c: AudienceChoice): Partial<AudienceChoice> | null {
  if (isEveryoneChoice(c)) return null;
  return {
    ...(c.institution ? { institution: c.institution } : {}),
    ...(c.batch ? { batch: true } : {}),
    ...(c.department ? { department: true } : {}),
    ...(c.city ? { city: true, ...(c.cityPlaceId ? { cityPlaceId: c.cityPlaceId } : {}) } : {}),
  };
}

/** The label shown while composing, built from the author's own values (same order as the server). */
export function choiceLabel(c: AudienceChoice, o: AudienceOptions | undefined): string {
  if (isEveryoneChoice(c)) return "Everyone on Alma Mater";
  const inst = c.institution ? o?.institutions.find((i) => i.key === c.institution)?.name ?? null : null;
  const bits = [
    inst,
    c.batch && o?.batch.value ? `${o.batch.value} batch` : null,
    c.department ? o?.department.value ?? null : null,
    c.city ? o?.city.value ?? null : null,
  ].filter((b): b is string => Boolean(b));
  return bits.length > 0 ? bits.join(" · ") : "A smaller group";
}

export type AudienceSizeLine = { tone: "plain" | "warn" | "block"; text: string };

export function audienceSizeLine(p: AudiencePreview | undefined, everyone: boolean): AudienceSizeLine | null {
  if (everyone) return { tone: "plain", text: "All members can see this." };
  if (!p || p.everyone) return null;
  if (p.size === "none") {
    return {
      tone: "block",
      text: "No one else matches all of these yet, so nobody would see your post. Remove one to continue.",
    };
  }
  if (p.size === "under10") return { tone: "warn", text: "Fewer than 10 people can see this. Remove one to reach more people." };
  return { tone: "plain", text: `About ${p.approx ?? 0} people can see this.` };
}

export function unavailableText(part: "batch" | "department" | "city", reason: AudienceUnavailableReason | null): string {
  if (part === "batch") return "Add your batch year to your profile to use this.";
  if (part === "department") {
    if (reason === "pending_review") return "Your department is waiting for review, so this isn't available yet.";
    if (reason === "other_department") return "Departments outside the list can't be matched yet.";
    return "Add your department to your profile to use this.";
  }
  if (reason === "city_not_linked") return "Your city isn't linked to a known city yet, so this isn't available.";
  if (reason === "city_pending") return "Your city is waiting for review, so this isn't available yet.";
  return "Add the city you live in to your profile to use this.";
}

/** Fresh state each time a composer opens: Everyone. */
export function freshAudienceChoice(): AudienceChoice {
  return { ...EVERYONE_CHOICE };
}
