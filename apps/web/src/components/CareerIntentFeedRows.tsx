import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { IntentcastFeedItem } from "../api/client";
import { api } from "../api/client";
import { Avatar } from "./Avatar";
import { BulletinDeleteIntentcastDialog } from "./BulletinDeleteIntentcastDialog";
import { BulletinOwnPostMenu } from "./BulletinOwnPostMenu";
import { DeptBatchMeta } from "./DeptBatchMeta";
import { DemoAuthorBadge } from "./DemoAuthorBadge";
import { CareerStyleSearchToolbar } from "./CareerStyleSearchToolbar";
import { DirectoryFilterDrawer } from "./DirectoryFilterDrawer";
import { IconChatBubble } from "./HomeIcons";
import { ReferralIntentHeadline } from "./ReferralIntentHeadline";
import {
  buildReferralIntentBulletinHeadline,
  isReferralIntentBulletinHeadline,
  splitBulletinPostBody,
  stripBulletinUiCategory,
} from "../lib/bulletinPostCardUtils";
import { demoDisplayFullName } from "../lib/demoProfile";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { normalizeOpportunityCard } from "../lib/intentcastOpportunityCard";
import {
  extractCareerAttributeHints,
  extractStructuredCareerRoleLink,
  hiringCompensationChipFromParsed,
  hiringExperienceChipFromParsed,
  parseHiringBulletin,
  promoteBareLeadingListingToResumeForReferral,
  stripHiringTailChipDuplicateProse,
  stripStructuredHiringTailMeta,
} from "../lib/parseHiringBulletin";
import { queryKeys } from "../lib/queryKeys";
import { PageStateBlock } from "./PageStateBlock";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";

export type CareerFeedVisualTone =
  | "hiring"
  | "referral"
  | "can_help"
  | "relocation"
  | "startups"
  | "inbound_reply";

/**
 * When `false`, posts created via **Can help** (API `guidance`) are omitted from Careers activity.
 * Set `true` to show them and re-enable the **People Who Can Help** tab in {@link TAB_DEFS}.
 */
const CAREER_FEED_INCLUDE_GUIDANCE = false;

/** Feed tabs — All / Hiring / Referral (internal ids unchanged for filtering). */
export type CareerFeedTabId = "all" | "open_roles" | "referral_requests" | "can_help";

export type CareerFeedRowModel = {
  id: string;
  tone: CareerFeedVisualTone;
  /** Primary headline — role / ask title */
  roleHeader: string;
  /** Second line — company name (optional · location when known) */
  companySubtitle: string | null;
  summary: string;
  /** Lane labels only (e.g. Hiring) — surfaced as the top pill */
  chips: string[];
  employmentType: string | null;
  compensation: string | null;
  experience: string | null;
  authorPersonId: string;
  authorFullName: string;
  authorDepartmentCode: string | null;
  authorBatchYear: number | null;
  authorRoleLine: string | null;
  postedRelative: string | null;
  postedAtIso: string | undefined;
  authorIsDemo: boolean;
  /** Listing URL from structured referral composer (`Role link:` line). */
  roleListingUrl: string | null;
  /** Resume URL from structured referral composer (`Resume link:` line). */
  resumeListingUrl: string | null;
};

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
    const authorFullName = demoDisplayFullName(item.authorFullName).trim() || item.authorFullName.trim();
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
      authorIsDemo: item.authorIsDemo === true,
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

  const authorFullName = demoDisplayFullName(item.authorFullName).trim() || item.authorFullName.trim();

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
    authorIsDemo: item.authorIsDemo === true,
    roleListingUrl,
    resumeListingUrl,
  };
}

function rowMatchesTab(row: CareerFeedRowModel, tab: CareerFeedTabId): boolean {
  switch (tab) {
    case "all":
      return true;
    case "open_roles":
      return row.tone === "hiring";
    case "referral_requests":
      return row.tone === "referral";
    case "can_help":
      return row.tone === "can_help";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function rowHaystack(row: CareerFeedRowModel): string {
  return [
    row.roleHeader,
    row.companySubtitle ?? "",
    row.summary,
    row.roleListingUrl ?? "",
    row.chips.join(" "),
    row.employmentType ?? "",
    row.compensation ?? "",
    row.experience ?? "",
    row.authorFullName,
    row.authorRoleLine ?? "",
  ]
    .join(" ")
    .toLowerCase();
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

/** Remote / hybrid / on-site hints from free-text fields (best-effort). */
function workArrangementSignals(text: string): string[] {
  const t = text.trim().toLowerCase();
  if (/\b(remote|wfh|work\s+from\s+home)\b/.test(t)) return ["Remote"];
  if (/\bhybrid\b/.test(t)) return ["Hybrid"];
  if (/\b(on[-\s]?site|in[-\s]?office)\b/.test(t)) return ["On-site"];
  return [];
}

/** Single lane pill — hiring / referral / can-help lanes. */
function laneBadgeLabel(tone: CareerFeedVisualTone): string {
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

/** Split `Title, Org` author line into two rows like the reference card. */
function splitAuthorRoleOrg(roleLine: string | null): { role: string | null; org: string | null } {
  if (!roleLine?.trim()) return { role: null, org: null };
  const parts = roleLine.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const org = parts[parts.length - 1] ?? null;
    const role = parts.slice(0, -1).join(", ") || null;
    return { role, org };
  }
  return { role: parts[0] ?? null, org: null };
}

export type IntentcastActivityRowsListProps = {
  rows: CareerFeedRowModel[];
  viewerPersonId: string | null;
  deleteSubmittingId: string | null;
  onRequestDelete: (intentcastId: string) => void;
  /** Merged onto `<ul>` after `career-feed-rows__list`. */
  listClassName?: string;
  /**
   * When false, rows where the viewer is the author do not show the bulletin delete menu.
   * Use for inbound-reply lists where row ids are not intentcast ids.
   */
  ownerDeleteMenu?: boolean;
};

/** Shared row layout for Careers activity and Home Active Requests. */
export function IntentcastActivityRowsList({
  rows,
  viewerPersonId,
  deleteSubmittingId,
  onRequestDelete,
  listClassName,
  ownerDeleteMenu = true,
}: IntentcastActivityRowsListProps) {
  return (
    <ul className={listClassName ? `career-feed-rows__list ${listClassName}` : "career-feed-rows__list"} role="list">
      {rows.map((row) => {
        const isOwn = Boolean(viewerPersonId && row.authorPersonId === viewerPersonId);
        const collapseWs = (s: string) => s.trim().replace(/\s+/g, " ");
        const summaryCollapsed = row.summary ? collapseWs(row.summary) : "";
        const description =
          summaryCollapsed.length > 0 &&
          summaryCollapsed !== collapseWs(row.roleHeader) &&
          (!row.companySubtitle || summaryCollapsed !== collapseWs(row.companySubtitle))
            ? row.summary
            : null;
        const messageTitle = [row.roleHeader, row.companySubtitle].filter(Boolean).join(" · ");
        const detailChipCandidates = [row.employmentType, row.experience, row.compensation].filter(
          (x): x is string => Boolean(x?.trim())
        );
        const hayStack = `${row.companySubtitle ?? ""} ${row.summary}`.trim();
        const secondaryTags = [...workArrangementSignals(hayStack)];
        if (row.roleListingUrl) secondaryTags.push("Apply link");
        const detailTags = [...detailChipCandidates, ...secondaryTags].slice(0, 5);
        const { role: authorRoleTitle, org: authorOrgName } = splitAuthorRoleOrg(row.authorRoleLine);
        return (
          <li key={row.id}>
            <article className={`career-feed-rows__row${isOwn ? " career-feed-rows__row--own" : ""}`}>
              <div className="career-feed-rows__row-layout">
                <div className="career-feed-rows__row-primary">
                  <div className="career-feed-rows__row-primary-body">
                    <div className={`career-feed-rows__lane-badge career-feed-rows__lane-badge--${row.tone}`}>
                      {laneBadgeLabel(row.tone)}
                    </div>
                    <ReferralIntentHeadline as="h3" className="career-feed-rows__row-title" headline={row.roleHeader} />
                    {row.companySubtitle ? (
                      <p className="career-feed-rows__row-company">{row.companySubtitle}</p>
                    ) : null}
                    {description ? <p className="career-feed-rows__row-desc">{description}</p> : null}
                    {row.roleListingUrl ? (
                      <p className="career-feed-rows__row-role-link">
                        <a href={row.roleListingUrl} target="_blank" rel="noopener noreferrer">
                          Role link
                        </a>
                      </p>
                    ) : null}
                    {row.resumeListingUrl ? (
                      <p className="career-feed-rows__row-role-link">
                        <a href={row.resumeListingUrl} target="_blank" rel="noopener noreferrer">
                          Resume link
                        </a>
                      </p>
                    ) : null}
                    {detailTags.length > 0 ? (
                      <ul className="career-feed-rows__tags career-feed-rows__tags--trail" aria-label="Role details">
                        {detailTags.map((label, i) => (
                          <li key={`${row.id}-${label}-${i}`} className="career-feed-rows__tag">
                            {label}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className="career-feed-rows__row-author-col">
                  <Link to={`/profiles/${row.authorPersonId}`} className="career-feed-rows__author-block">
                    <Avatar name={row.authorFullName} size="md" tone="pastel" />
                    <span className="career-feed-rows__author-block-text">
                      <span className="career-feed-rows__author-block-name-row">
                        <span className="career-feed-rows__author-block-name">{row.authorFullName}</span>
                        {row.authorIsDemo ? <DemoAuthorBadge /> : null}
                      </span>
                      <DeptBatchMeta
                        className="career-feed-rows__author-block-meta dept-batch-meta"
                        departmentCode={row.authorDepartmentCode}
                        batchYear={row.authorBatchYear}
                      />
                      {authorRoleTitle ? (
                        <span className="career-feed-rows__author-block-role">{authorRoleTitle}</span>
                      ) : null}
                      {authorOrgName ? (
                        <span className="career-feed-rows__author-block-org">{authorOrgName}</span>
                      ) : null}
                    </span>
                  </Link>
                </div>

                <div className="career-feed-rows__row-rail-col">
                  <div className="career-feed-rows__rail-top">
                    {!isOwn ? (
                      <button
                        type="button"
                        className="btn career-feed-rows__message-btn"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent("messaging:open-draft", {
                              detail: {
                                recipientPersonId: row.authorPersonId,
                                recipientName: row.authorFullName,
                                initialMessage: "",
                                kind: "general",
                                requestTitle: messageTitle,
                                recipientDepartmentCode: row.authorDepartmentCode,
                                recipientBatchYear: row.authorBatchYear,
                              },
                            })
                          );
                        }}
                      >
                        <IconChatBubble className="career-feed-rows__message-btn-icon" aria-hidden />
                        Message
                      </button>
                    ) : ownerDeleteMenu ? (
                      <BulletinOwnPostMenu
                        detachDropdown
                        deleteDisabled={deleteSubmittingId === row.id}
                        onRequestDelete={() => onRequestDelete(row.id)}
                      />
                    ) : null}
                  </div>
                  <div className="career-feed-rows__rail-bottom">
                    {row.postedRelative ? (
                      <time className="career-feed-rows__rail-time" dateTime={row.postedAtIso}>
                        {row.postedRelative}
                      </time>
                    ) : (
                      <span className="career-feed-rows__rail-time career-feed-rows__time--placeholder" aria-hidden>
                        —
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

// TODO: when re-enabling guidance in this feed, append `{ id: "can_help", label: "People Who Can Help" }`.
const TAB_DEFS: Array<{ id: CareerFeedTabId; label: string }> = CAREER_FEED_INCLUDE_GUIDANCE
  ? [
      { id: "all", label: "All" },
      { id: "open_roles", label: "Hiring" },
      { id: "referral_requests", label: "Referral" },
      { id: "can_help", label: "People Who Can Help" },
    ]
  : [
      { id: "all", label: "All" },
      { id: "open_roles", label: "Hiring" },
      { id: "referral_requests", label: "Referral" },
    ];

type CareerIntentFeedRowsProps = {
  intentcasts: IntentcastFeedItem[];
  loading: boolean;
  /** True when the feed request failed and there is nothing cached to show. */
  error?: boolean;
  viewerPersonId: string | null;
  /** Extra class on root `<section>` */
  className?: string;
};

export function CareerIntentFeedRows({ intentcasts, loading, error = false, viewerPersonId, className }: CareerIntentFeedRowsProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CareerFeedTabId>("all");

  useEffect(() => {
    if (!CAREER_FEED_INCLUDE_GUIDANCE && activeTab === "can_help") {
      setActiveTab("all");
    }
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSubmittingId, setDeleteSubmittingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  const deleteBusy = Boolean(deleteConfirmId && deleteSubmittingId === deleteConfirmId);

  useBodyScrollLock(Boolean(deleteConfirmId));
  useDialogFocusManager({
    open: Boolean(deleteConfirmId),
    containerRef: deleteDialogRef,
    onClose: deleteBusy ? undefined : () => setDeleteConfirmId(null),
  });

  const baseRows = useMemo(() => {
    const rows: CareerFeedRowModel[] = [];
    for (const item of intentcasts) {
      const row = mapIntentcastToRow(item);
      if (row) rows.push(row);
    }
    return rows;
  }, [intentcasts]);

  const tabCounts = useMemo(() => {
    return {
      all: baseRows.length,
      open_roles: baseRows.filter((r) => r.tone === "hiring").length,
      referral_requests: baseRows.filter((r) => r.tone === "referral").length,
      can_help: baseRows.filter((r) => r.tone === "can_help").length,
    };
  }, [baseRows]);

  const filteredRows = useMemo(() => {
    let rows = baseRows.filter((r) => rowMatchesTab(r, activeTab));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => rowHaystack(r).includes(q));
    }
    const co = companyFilter.trim().toLowerCase();
    if (co) {
      rows = rows.filter((r) => {
        const hay = `${r.companySubtitle ?? ""} ${r.roleHeader} ${r.summary}`.toLowerCase();
        return hay.includes(co);
      });
    }
    const role = roleFilter.trim().toLowerCase();
    if (role) {
      rows = rows.filter(
        (r) =>
          r.roleHeader.toLowerCase().includes(role) ||
          r.summary.toLowerCase().includes(role) ||
          (r.employmentType ?? "").toLowerCase().includes(role) ||
          (r.compensation ?? "").toLowerCase().includes(role) ||
          (r.experience ?? "").toLowerCase().includes(role)
      );
    }
    const city = cityFilter.trim().toLowerCase();
    if (city) {
      rows = rows.filter(
        (r) =>
          (r.companySubtitle ?? "").toLowerCase().includes(city) ||
          r.summary.toLowerCase().includes(city) ||
          (r.compensation ?? "").toLowerCase().includes(city) ||
          (r.experience ?? "").toLowerCase().includes(city)
      );
    }
    return rows;
  }, [baseRows, activeTab, searchQuery, companyFilter, roleFilter, cityFilter]);

  const activeAdvancedFilterCount = useMemo(() => {
    return [companyFilter, roleFilter, cityFilter].filter((s) => s.trim().length > 0).length;
  }, [companyFilter, roleFilter, cityFilter]);

  const clearAdvancedFilters = useCallback(() => {
    setCompanyFilter("");
    setRoleFilter("");
    setCityFilter("");
  }, []);

  const executeDelete = useCallback(
    async (intentcastId: string) => {
      setDeleteError(null);
      setDeleteSubmittingId(intentcastId);
      const { error } = await api.delete(`/v1/intentcasts/${intentcastId}`);
      setDeleteSubmittingId(null);
      if (error) {
        if (error.code === "INTENTCAST_ALREADY_REMOVED") {
          setDeleteConfirmId(null);
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
          return;
        }
        setDeleteError(error.message ?? error.code ?? "Could not remove post.");
        return;
      }
      setDeleteConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
      void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
    },
    [queryClient]
  );

  const rootClass = `career-feed-rows ds-surface-card${className ? ` ${className}` : ""}`.trim();

  return (
    <section className={rootClass} aria-labelledby="career-feed-rows-heading">
      <h2 id="career-feed-rows-heading" className="career-feed-rows__title">
        Careers activity
      </h2>

      <div className="career-feed-rows__sticky-controls">
        <div className="career-feed-rows__tabs" role="tablist" aria-label="Careers activity">
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`career-feed-rows__tab${activeTab === tab.id ? " career-feed-rows__tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="career-feed-rows__tab-inner">
                {tab.label}
                <span className="career-feed-rows__tab-count"> ({tabCounts[tab.id]})</span>
              </span>
            </button>
          ))}
        </div>

        <CareerStyleSearchToolbar
          keyword={searchQuery}
          onKeywordChange={setSearchQuery}
          filterCount={activeAdvancedFilterCount}
          onOpenFilters={() => setFiltersDrawerOpen(true)}
          filtersDrawerOpen={filtersDrawerOpen}
          keywordFieldLabel="Search posts"
        />
      </div>

      <DirectoryFilterDrawer
        open={filtersDrawerOpen}
        onClose={() => setFiltersDrawerOpen(false)}
        title="Refine posts"
      >
        <div className="career-feed-rows__drawer-fields">
          <label className="career-feed-rows__field">
            <span className="career-feed-rows__field-label">Company</span>
            <input
              type="text"
              className="career-feed-rows__filter-input"
              placeholder="Any company"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="career-feed-rows__field">
            <span className="career-feed-rows__field-label">Role / Function</span>
            <input
              type="text"
              className="career-feed-rows__filter-input"
              placeholder="Any role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="career-feed-rows__field">
            <span className="career-feed-rows__field-label">City</span>
            <input
              type="text"
              className="career-feed-rows__filter-input"
              placeholder="Any city"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="career-feed-rows__drawer-actions">
            <button type="button" className="btn btn--secondary" onClick={clearAdvancedFilters}>
              Clear all
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setFiltersDrawerOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </DirectoryFilterDrawer>

      {deleteError ? (
        <p className="career-feed-rows__inline-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      {loading ? (
        <p className="career-feed-rows__state" role="status">
          Loading activity…
        </p>
      ) : error && baseRows.length === 0 ? (
        <PageStateBlock
          title="Couldn’t load activity"
          description="Something went wrong on our side. Please try again in a moment."
          tone="error"
        />
      ) : filteredRows.length === 0 ? (
        <p className="career-feed-rows__state">
          {baseRows.length === 0
            ? CAREER_FEED_INCLUDE_GUIDANCE
              ? "No activity yet. Post a role, a referral ask, or how you can help from Careers or Home."
              : "No activity yet. Post a role or a referral ask from Careers or Home."
            : "No posts match these filters."}
        </p>
      ) : (
        <IntentcastActivityRowsList
          rows={filteredRows}
          viewerPersonId={viewerPersonId}
          deleteSubmittingId={deleteSubmittingId}
          onRequestDelete={setDeleteConfirmId}
        />
      )}

      <BulletinDeleteIntentcastDialog
        open={Boolean(deleteConfirmId)}
        deleteDialogRef={deleteDialogRef}
        submitting={deleteBusy}
        onRequestClose={() => {
          if (!deleteBusy) setDeleteConfirmId(null);
        }}
        onConfirm={() => {
          if (!deleteConfirmId) return;
          void executeDelete(deleteConfirmId);
        }}
      />
    </section>
  );
}
