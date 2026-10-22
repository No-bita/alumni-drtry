import type { IntentcastFeedItem } from "../api/client";
import type { CareerFeedRowModel, CareerFeedVisualTone } from "../components/CareerIntentFeedRows";
import {
  buildReferralIntentBulletinHeadline,
  isReferralIntentBulletinHeadline,
  splitBulletinPostBody,
  stripBulletinUiCategory,
} from "./bulletinPostCardUtils";
import { formatRelativeTime } from "./formatRelativeTime";
import { normalizeOpportunityCard } from "./intentcastOpportunityCard";
import {
  extractCareerAttributeHints,
  extractStructuredCareerRoleLink,
  hiringCompensationChipFromParsed,
  hiringExperienceChipFromParsed,
  parseHiringBulletin,
  promoteBareLeadingListingToResumeForReferral,
  stripHiringTailChipDuplicateProse,
  stripStructuredHiringTailMeta,
} from "./parseHiringBulletin";

export const CAREER_FEED_INCLUDE_GUIDANCE = false;

/** Second line in Careers activity: `Company · Location`. */
function formatCareersCompanyLocationLine(company: string, locationLine: string): string | null {
  const c = company.trim();
  const l = locationLine.trim();
  if (c && l) return `${c} · ${l}`;
  if (c) return c;
  if (l) return l;
  return null;
}

/** Split trailing ` at <company>` from titles like `Senior Engineer at Acme`. */
function splitRoleAtCompany(title: string): { role: string; company: string | null } {
  const t = title.trim();
  const token = " at ";
  const idx = t.toLowerCase().lastIndexOf(token);
  if (idx > 0 && idx + token.length < t.length) {
    const role = t.slice(0, idx).trim();
    const company = t.slice(idx + token.length).trim();
    if (role.length > 0 && company.length > 0) {
      return { role, company };
    }
  }
  return { role: t, company: null };
}

export type MapIntentcastToRowOptions = {
  /** Home Active Requests includes guidance posts; the Careers feed hides them unless {@link CAREER_FEED_INCLUDE_GUIDANCE}. */
  includeGuidancePosts?: boolean;
};

export function mapIntentcastToRow(
  item: IntentcastFeedItem,
  options?: MapIntentcastToRowOptions
): CareerFeedRowModel | null {
  const allowGuidance = CAREER_FEED_INCLUDE_GUIDANCE || options?.includeGuidancePosts === true;
  if (item.category === "guidance" && !allowGuidance) {
    return null;
  }

  if (item.category === "collaboration") {
    const normalized = normalizeOpportunityCard(item.content, item.category);
    const stripped = stripBulletinUiCategory(item.content);
    const splitBulletin = splitBulletinPostBody(stripped);
    const bulletinTitleFull = splitBulletin.title.trim();
    const bulletinSummaryFull = (splitBulletin.summary ?? "").trim();
    const lane = normalized.category;
    const tone: CareerFeedVisualTone =
      lane === "hiring"
        ? "hiring"
        : lane === "relocation"
          ? "relocation"
          : lane === "startups"
            ? "startups"
            : lane === "guidance"
              ? "can_help"
              : "referral";
    const roleHeader = (normalized.title.trim() || bulletinTitleFull || "Post").slice(0, 200);
    const summaryText = (normalized.summary.trim() || bulletinSummaryFull).slice(0, 2000);
    const chips = mergeCareerLaneChip(tone, normalized.chips.filter(Boolean).slice(0, 6));
    const parts = [item.authorCurrentRoleTitle?.trim(), item.authorCurrentOrganizationName?.trim()].filter(Boolean);
    const authorRoleLine = parts.length ? parts.join(", ") : null;
    const authorFullName = (item.authorFullName ?? "").trim() || item.authorFullName.trim();
    return {
      id: item.id,
      tone,
      roleHeader,
      companySubtitle: null,
      summary: summaryText,
      chips,
      employmentType: null,
      compensation: null,
      experience: null,
      authorPersonId: item.authorPersonId,
      authorFullName,
      authorDepartmentCode: item.authorDepartmentCode,
      authorBatchYear: item.authorBatchYear ?? null,
      authorRoleLine,
      postedRelative: item.createdAt ? formatRelativeTime(item.createdAt) : null,
      postedAtIso: item.createdAt,
      roleListingUrl: null,
      resumeListingUrl: null,
    };
  }

  if (item.category !== "hiring" && item.category !== "mentorship" && item.category !== "guidance") {
    return null;
  }

  const isHiringLane = item.category === "hiring";
  const isCanHelpLane = item.category === "guidance";
  const normalized = normalizeOpportunityCard(item.content, item.category);

  const stripped = stripBulletinUiCategory(item.content);
  const splitBulletin = splitBulletinPostBody(stripped);
  const bulletinTitleFull = splitBulletin.title.trim();
  const bulletinSummaryFull = (splitBulletin.summary ?? "").trim();
  const parsed = parseHiringBulletin(stripped);
  const chipsFallback = normalized.chips.filter(Boolean).slice(0, 6);

  let roleHeader: string;
  let companySubtitle: string | null = null;
  /** Feed description line — structured posts use parsed tail; legacy uses normalized summary. */
  let summaryText: string;
  let employmentType: string | null = null;
  let compensation: string | null = null;
  let experience: string | null = null;
  let roleListingUrl: string | null = null;
  let resumeListingUrl: string | null = null;

  if (parsed) {
    if (isHiringLane) {
      roleHeader = parsed.title.trim() || bulletinTitleFull;
      companySubtitle = formatCareersCompanyLocationLine(parsed.company, parsed.locationLine);
      if (!companySubtitle && chipsFallback.length > 0) {
        companySubtitle = chipsFallback.slice(0, 2).join(" · ");
      }
    } else {
      roleHeader = buildReferralIntentBulletinHeadline(
        parsed.title.trim() || bulletinTitleFull,
        parsed.company.trim()
      );
      companySubtitle = null;
    }
    employmentType = parsed.employmentLabel?.trim() || null;
    experience = hiringExperienceChipFromParsed(parsed.experienceLabel);
    compensation = hiringCompensationChipFromParsed(parsed.salaryLabel);

    if (isHiringLane) {
      const proseTail = stripStructuredHiringTailMeta(
        stripHiringTailChipDuplicateProse(parsed.description)
      ).trim();
      summaryText = proseTail || bulletinSummaryFull;
    } else {
      const coerced = promoteBareLeadingListingToResumeForReferral(
        extractStructuredCareerRoleLink(parsed.description)
      );
      roleListingUrl = coerced.listingUrl;
      resumeListingUrl = coerced.resumeUrl;
      const proseTail = stripStructuredHiringTailMeta(coerced.proseAfterLink).trim();
      summaryText = proseTail || bulletinSummaryFull;
    }
  } else {
    const titleTrim = bulletinTitleFull;
    if (item.category === "mentorship" && isReferralIntentBulletinHeadline(titleTrim)) {
      roleHeader = titleTrim;
      companySubtitle = null;
    } else {
      const split = splitRoleAtCompany(titleTrim);
      roleHeader = split.role.length > 0 ? split.role : titleTrim;
      companySubtitle = split.company;
    }
    summaryText = bulletinSummaryFull;
    if (!isHiringLane) {
      const coerced = promoteBareLeadingListingToResumeForReferral(
        extractStructuredCareerRoleLink(bulletinSummaryFull)
      );
      roleListingUrl = coerced.listingUrl;
      resumeListingUrl = coerced.resumeUrl;
      summaryText = stripStructuredHiringTailMeta(
        stripHiringTailChipDuplicateProse(coerced.proseAfterLink)
      ).trim();
    }
    if (!companySubtitle && isHiringLane && chipsFallback.length > 0) {
      companySubtitle = chipsFallback.slice(0, 2).join(" · ");
    }
    const hints = extractCareerAttributeHints(`${stripped}\n${summaryText}`);
    employmentType = hints.employmentLabel;
    experience = hiringExperienceChipFromParsed(hints.experienceLabel);
    compensation = hiringCompensationChipFromParsed(hints.salaryLabel);
  }

  if (!roleHeader) {
    roleHeader = "Post";
  }

  const tone: CareerFeedVisualTone = isHiringLane ? "hiring" : isCanHelpLane ? "can_help" : "referral";

  const chips = mergeCareerLaneChip(tone, []);

  const parts = [item.authorCurrentRoleTitle?.trim(), item.authorCurrentOrganizationName?.trim()].filter(Boolean);
  const authorRoleLine = parts.length ? parts.join(", ") : null;

  const authorFullName = (item.authorFullName ?? "").trim() || item.authorFullName.trim();

  return {
    id: item.id,
    tone,
    roleHeader,
    companySubtitle,
    summary: summaryText,
    chips,
    employmentType,
    compensation,
    experience,
    authorPersonId: item.authorPersonId,
    authorFullName,
    authorDepartmentCode: item.authorDepartmentCode,
    authorBatchYear: item.authorBatchYear ?? null,
    authorRoleLine,
    postedRelative: item.createdAt ? formatRelativeTime(item.createdAt) : null,
    postedAtIso: item.createdAt,
    roleListingUrl,
    resumeListingUrl,
  };
}

/** Lane chip text aligned with hub entry points: Hire alumni → Hiring; Find referrals → Referral; Can help → Can Help */
function toneLaneChipLabel(tone: CareerFeedVisualTone): string {
  switch (tone) {
    case "hiring":
      return "Hiring";
    case "referral":
      return "Referral";
    case "can_help":
      return "Can Help";
    case "relocation":
      return "Relocation";
    case "startups":
      return "Startups";
    case "inbound_reply":
      return "Reply";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

function mergeCareerLaneChip(tone: CareerFeedVisualTone, detailChips: string[]): string[] {
  const lane = toneLaneChipLabel(tone);
  const norm = (s: string) => s.trim().toLowerCase();
  const laneN = norm(lane);
  const rest = detailChips.filter((c) => norm(c) !== laneN);
  return [lane, ...rest];
}
