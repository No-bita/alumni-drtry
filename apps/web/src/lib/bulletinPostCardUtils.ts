import type { IntentcastFeedItem } from "../api/client";
import {
  BULLETIN_DESCRIPTION_MAX_CHARS,
  BULLETIN_TITLE_MAX_CHARS,
} from "../constants/bulletin";

/** Visual tone for category pills / borders — aligned with home bulletin chips. */
export type BulletinCardTone = "referrals" | "moving_cities" | "hiring";
export type BulletinUiCategory = "careers" | "hiring" | "relocation" | "startups" | "guidance";

const BULLETIN_UI_CATEGORY_PREFIX = /^\s*\[\[cat:(careers|hiring|relocation|startups|guidance)\]\]\s*\n?/i;

export function extractBulletinUiCategory(raw: string): BulletinUiCategory | null {
  const match = raw.match(BULLETIN_UI_CATEGORY_PREFIX);
  if (!match) return null;
  const value = (match[1] ?? "").toLowerCase();
  switch (value) {
    case "careers":
    case "hiring":
    case "relocation":
    case "startups":
    case "guidance":
      return value;
    default:
      return null;
  }
}

export function stripBulletinUiCategory(raw: string): string {
  return raw.replace(BULLETIN_UI_CATEGORY_PREFIX, "");
}

export function encodeBulletinContentWithUiCategory(content: string, category: BulletinUiCategory): string {
  const cleanContent = stripBulletinUiCategory(content).trim();
  return `[[cat:${category}]]\n${cleanContent}`.trim();
}

/** Cohort label e.g. 2024 → '24 */
export function formatBatchYearShort(year: number): string {
  const y = Math.floor(year) % 100;
  return `'${String(y).padStart(2, "0")}`;
}

/** Bulletin first-line opener for mentorship referral asks (composer + feed detection). */
export const REFERRAL_INTENT_HEADLINE_PREFIX = "Looking for referral";

/** Builds the stored headline line: `Looking for referral for {role} at {company}` or without `at` when company is omitted. */
export function buildReferralIntentBulletinHeadline(role: string, company: string): string {
  const r = role.trim();
  const c = company.trim();
  if (c) return `${REFERRAL_INTENT_HEADLINE_PREFIX} for ${r} at ${c}`;
  return `${REFERRAL_INTENT_HEADLINE_PREFIX} for ${r}`;
}

function referralIntentHeadlineStartsWithPrefix(titleTrimmed: string, connector: string): boolean {
  const needle = `${REFERRAL_INTENT_HEADLINE_PREFIX}${connector}`;
  return (
    titleTrimmed.length >= needle.length &&
    titleTrimmed.slice(0, needle.length).toLowerCase() === needle.toLowerCase()
  );
}

/**
 * True when the first line is a referral-intent headline from {@link buildReferralIntentBulletinHeadline}.
 * Also matches legacy lines that used an em dash after the prefix.
 */
export function isReferralIntentBulletinHeadline(firstLine: string): boolean {
  const t = firstLine.trim();
  return referralIntentHeadlineStartsWithPrefix(t, " for ") || referralIntentHeadlineStartsWithPrefix(t, " — ");
}

/** Parsed segments for typography (lead vs role / company). */
export type ReferralIntentHeadlineParts = {
  lead: string;
  role: string;
  company: string | null;
};

/**
 * Splits a stored referral headline for display. Matches {@link buildReferralIntentBulletinHeadline} and the legacy ` — ` connector.
 * Uses the last ` at ` to separate role vs company when both are present.
 */
export function splitReferralIntentHeadlineForDisplay(headline: string): ReferralIntentHeadlineParts | null {
  const trim = headline.trim();
  const forMatch = trim.match(/^Looking for referral for /i);
  const dashMatch = forMatch ? null : trim.match(/^Looking for referral — /i);
  const lead = forMatch?.[0] ?? dashMatch?.[0];
  if (!lead) return null;
  const body = trim.slice(lead.length).trim();
  const atTok = " at ";
  const idx = body.toLowerCase().lastIndexOf(atTok.toLowerCase());
  if (idx > 0) {
    const role = body.slice(0, idx).trim();
    const company = body.slice(idx + atTok.length).trim();
    if (role && company) return { lead, role, company };
  }
  if (!body) return null;
  return { lead, role: body, company: null };
}

/** First non-empty line = title; remaining lines = summary. */
export function splitBulletinPostBody(raw: string): { title: string; summary: string | null } {
  const lines = stripBulletinUiCategory(raw).trim().split(/\r?\n/);
  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmptyIdx < 0) return { title: "", summary: null };
  const title = lines[firstNonEmptyIdx].trim();
  const rest = lines
    .slice(firstNonEmptyIdx + 1)
    .join("\n")
    .trim();
  return { title, summary: rest.length > 0 ? rest : null };
}

/** Client-side check aligned with API rules for guidance / mentorship / collaboration posts. */
export function validateGeneralBulletinHeadlineDetails(content: string): string | null {
  const { title, summary } = splitBulletinPostBody(content);
  if (title.length > BULLETIN_TITLE_MAX_CHARS) {
    return `Headline (first line) must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
  }
  const desc = summary ?? "";
  if (desc.length > BULLETIN_DESCRIPTION_MAX_CHARS) {
    return `Details (lines after the headline) must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`;
  }
  return null;
}

export function intentcastCategoryToTone(cat: IntentcastFeedItem["category"]): BulletinCardTone {
  switch (cat) {
    case "guidance":
      return "referrals";
    case "mentorship":
      return "referrals";
    case "collaboration":
      return "moving_cities";
    case "hiring":
      return "hiring";
  }
}

export function intentcastCategoryBadgeLabel(cat: IntentcastFeedItem["category"]): string {
  switch (cat) {
    case "guidance":
      return "Guidance";
    case "mentorship":
      return "Mentorship";
    case "collaboration":
      return "Collaboration";
    case "hiring":
      return "Hiring";
  }
}
