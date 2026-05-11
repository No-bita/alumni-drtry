import type { IntentcastFeedItem } from "../api/client";
import {
  buildReferralIntentBulletinHeadline,
  extractBulletinUiCategory,
  splitBulletinPostBody,
  stripBulletinUiCategory,
} from "./bulletinPostCardUtils";
import {
  hiringCompensationChipFromParsed,
  hiringExperienceChipFromParsed,
  parseHiringBulletin,
  splitHiringDetailsForCard,
  stripHiringTailChipDuplicateProse,
  stripStructuredHiringTailMeta,
} from "./parseHiringBulletin";

/** Home / bulletin chip lane (excludes aggregate filters `all` and `replies`). */
export type HomeOpportunityFeedLane = "careers" | "hiring" | "relocation" | "startups" | "guidance";

export function mapIntentcastCategoryToHomeCategory(category: IntentcastFeedItem["category"]): HomeOpportunityFeedLane {
  if (category === "hiring") return "hiring";
  if (category === "guidance") return "guidance";
  if (category === "mentorship") return "careers";
  return "startups";
}

export function normalizeOpportunityCard(content: string, category: IntentcastFeedItem["category"]): {
  title: string;
  summary: string;
  chips: string[];
  category: HomeOpportunityFeedLane;
} {
  const mappedFromPrefix = extractBulletinUiCategory(content);
  const sanitizedContent = stripBulletinUiCategory(content);
  const mappedCategory = mappedFromPrefix ?? mapIntentcastCategoryToHomeCategory(category);
  const parsed = parseHiringBulletin(sanitizedContent);
  if (!parsed) {
    const relocationHint = /\b(move|moving|relocate|relocation|city|housing|accommodation)\b/i.test(sanitizedContent);
    const { title: headline, summary: detail } = splitBulletinPostBody(sanitizedContent);
    const titleLine = headline.slice(0, 72);
    const detailLine = detail ? detail.trim().slice(0, 160) : "";
    return {
      title: titleLine,
      summary: detailLine,
      chips: [],
      category: relocationHint ? "relocation" : mappedCategory,
    };
  }
  const body = splitHiringDetailsForCard(parsed.description);
  if (category === "mentorship") {
    const chips = [
      parsed.employmentLabel,
      hiringExperienceChipFromParsed(parsed.experienceLabel),
      hiringCompensationChipFromParsed(parsed.salaryLabel),
    ].filter((c): c is string => Boolean(c));
    const headline = buildReferralIntentBulletinHeadline(parsed.title, parsed.company);
    const plain =
      body.roleSummary.trim() ||
      stripHiringTailChipDuplicateProse(stripStructuredHiringTailMeta(parsed.description)).trim();
    return {
      title: headline.slice(0, 72),
      summary: plain.slice(0, 160),
      chips,
      category: mappedCategory,
    };
  }
  const chips = [
    hiringExperienceChipFromParsed(parsed.experienceLabel),
    parsed.employmentLabel,
    hiringCompensationChipFromParsed(parsed.salaryLabel),
  ].filter((c): c is string => Boolean(c));
  const plain =
    body.roleSummary.trim() ||
    stripHiringTailChipDuplicateProse(stripStructuredHiringTailMeta(parsed.description)).trim();
  return {
    title: `${parsed.title} at ${parsed.company}`,
    summary: plain.slice(0, 160),
    chips,
    category: mappedCategory,
  };
}
