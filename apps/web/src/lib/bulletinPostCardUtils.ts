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
