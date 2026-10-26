import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { splitBulletinPostBody, stripBulletinUiCategory } from "../lib/bulletinPostCardUtils";
import type { IntentcastFeedItem, ReceivedBulletinRepliesFeedResponse, ReceivedBulletinReplyFeedItem } from "../api/client";
import { api } from "../api/client";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { queryKeys } from "../lib/queryKeys";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import { BulletinDeleteIntentcastDialog } from "./BulletinDeleteIntentcastDialog";
import { IconBriefcase, IconChatBubble, IconCity, IconRefer } from "./HomeIcons";
import { normalizeOpportunityCard, type HomeOpportunityFeedLane } from "../lib/intentcastOpportunityCard";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import { isFeedEmpty, visibleCategoryIds } from "../lib/emptyFeedDefense";
import { IntentcastActivityRowsList, type CareerFeedRowModel } from "./CareerIntentFeedRows";

export type HomeOpportunityCategory = HomeOpportunityFeedLane | "all" | "replies";
import type { HomeOpportunityCategoryLegacy } from "../lib/homeOpportunityCategory";

export type HomeOpportunityItem = {
  id: string;
  personId: string;
  fullName: string;
  departmentCode: string | null;
  /** Graduation / cohort year when known */
  batchYear: number | null;
  /** Relative posted time (footer, right) */
  postedRelative?: string | null;
  postedAtIso?: string | null;
  title: string;
  summary: string;
  chips: string[];
  category: HomeOpportunityCategoryLegacy;
};

/** Max posts shown in the home Bulletin stack (per active category). */
export const HOME_OPPORTUNITY_RAIL_PAGE_SIZE = 48;

type HomeOpportunityRailProps = {
  intentcasts: IntentcastFeedItem[];
  activeCategory: HomeOpportunityCategory;
  onCategoryChange: (category: HomeOpportunityCategory) => void;
  categoryCounts: Record<Exclude<HomeOpportunityCategory, "all">, number>;
  /** When true, hide the empty state until the intentcasts feed has finished its initial load (or equivalent fetch). */
  opportunitiesFeedLoading?: boolean;
  /** True when the intentcasts feed request failed; the empty-feed state is only shown for a confirmed empty result. */
  opportunitiesFeedError?: boolean;
  /** Signed-in viewer id — own posts get a delete menu. */
  viewerPersonId?: string | null;
  bulletinRepliesFeed?: ReceivedBulletinRepliesFeedResponse;
  bulletinRepliesLoading?: boolean;
  /** Opens the post composer; powers the "be the first to ask" button on an empty feed. */
  /** Opens the post flow ("Post to The Wall"). */
  onPost?: () => void;
};

const CATEGORIES: Array<{ id: Exclude<HomeOpportunityCategory, "all">; label: string }> = [
  { id: "careers", label: "Careers" },
  { id: "relocation", label: "Relocation" },
  { id: "startups", label: "Startups" },
  { id: "guidance", label: "Guidance" },
  { id: "replies", label: "Replies" },
];

function intentcastHomeLane(ic: IntentcastFeedItem): Exclude<HomeOpportunityCategory, "all" | "replies"> {
  return normalizeOpportunityCard(ic.content, ic.category).category;
}

function bulletinReplyPostHeadline(intentcastContent: string): string {
  const stripped = stripBulletinUiCategory(intentcastContent);
  const { title } = splitBulletinPostBody(stripped);
  const t = title.trim();
  return t.length > 0 ? t.slice(0, 160) : "Your request";
}

function truncateChipLabel(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function mapBulletinReplyToActivityRow(reply: ReceivedBulletinReplyFeedItem): CareerFeedRowModel {
  const postHeadline = bulletinReplyPostHeadline(reply.intentcastContent);
  const chip = truncateChipLabel(postHeadline, 52);
  const authorFullName = (reply.responderFullName ?? "").trim() || reply.responderFullName.trim();
  return {
    id: reply.responseId,
    tone: "inbound_reply",
    roleHeader: postHeadline,
    companySubtitle: null,
    summary: reply.responseMessage,
    chips: [chip],
    employmentType: null,
    compensation: null,
    experience: null,
    authorPersonId: reply.responderPersonId,
    authorFullName,
    authorDepartmentCode: reply.responderDepartmentCode,
    authorBatchYear: reply.responderBatchYear,
    authorRoleLine: null,
    postedRelative: formatRelativeTime(reply.responseCreatedAt),
    postedAtIso: reply.responseCreatedAt,
    roleListingUrl: null,
    resumeListingUrl: null,
  };
}

export function HomeOpportunityRail({
  intentcasts,
  activeCategory,
  onCategoryChange,
  categoryCounts,
  opportunitiesFeedLoading = false,
  opportunitiesFeedError = false,
  viewerPersonId = null,
  bulletinRepliesFeed,
  bulletinRepliesLoading = false,
  onPost,
}: HomeOpportunityRailProps) {
  const queryClient = useQueryClient();
  const showingReplies = activeCategory === "replies";
  const filteredIntentcasts = (
    showingReplies ? [] : activeCategory === "all" ? intentcasts : intentcasts.filter((ic) => intentcastHomeLane(ic) === activeCategory)
  ).slice(0, HOME_OPPORTUNITY_RAIL_PAGE_SIZE);

  const activityRows: CareerFeedRowModel[] = filteredIntentcasts
    .map((ic) => mapIntentcastToRow(ic, { includeGuidancePosts: true }))
    .filter((r): r is CareerFeedRowModel => r != null);

  const replyRows: CareerFeedRowModel[] = (bulletinRepliesFeed?.responses ?? []).map(mapBulletinReplyToActivityRow);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSubmittingId, setDeleteSubmittingId] = useState<string | null>(null);
  const [railDeleteError, setRailDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  const deleteBusy = Boolean(deleteConfirmId && deleteSubmittingId === deleteConfirmId);

  useBodyScrollLock(Boolean(deleteConfirmId));
  useDialogFocusManager({
    open: Boolean(deleteConfirmId),
    containerRef: deleteDialogRef,
    onClose: deleteBusy ? undefined : () => setDeleteConfirmId(null),
  });

  const executeDelete = useCallback(
    async (intentcastId: string) => {
      setRailDeleteError(null);
      setDeleteSubmittingId(intentcastId);
      const { error } = await api.delete(`/v1/intentcasts/${intentcastId}`);
      setDeleteSubmittingId(null);
      if (error) {
        if (error.code === "INTENTCAST_ALREADY_REMOVED") {
          setDeleteConfirmId(null);
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.home.receivedBulletinReplies() });
          return;
        }
        setRailDeleteError(error.message ?? error.code ?? "Could not remove post.");
        return;
      }
      setDeleteConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home.receivedBulletinReplies() });
    },
    [queryClient]
  );

  const feedIsEmpty = !opportunitiesFeedLoading && !opportunitiesFeedError && isFeedEmpty(categoryCounts);
  const chipIds = visibleCategoryIds(CATEGORIES.map((c) => c.id), categoryCounts);
  const chipCategories = CATEGORIES.filter((c) => chipIds.includes(c.id));

  return (
    <section className="home-ideal__opportunities ds-surface-card" aria-labelledby="home-opportunities-heading">
      <header className="home-ideal__opportunities-header ds-section-head">
        <div className="home-ideal__opportunities-headcopy">
          <h2 id="home-opportunities-heading" className="home-ideal__opportunities-title ds-title-lg">
            The Wall
          </h2>
          <p className="home-ideal__opportunities-sub">Ask for help, or share an opportunity, with every alum here.</p>
        </div>
        {onPost ? (
          <button type="button" className="btn btn--secondary home-ideal__opportunities-post" onClick={onPost}>
            Post to The Wall
          </button>
        ) : null}
      </header>
      {railDeleteError ? (
        <p className="home-dashboard__bulletin-inline-error home-ideal__opportunity-rail-error" role="alert">
          {railDeleteError}
        </p>
      ) : null}
      {chipCategories.length > 0 ? (
      <div className="home-ideal__chips" role="tablist" aria-label="Opportunity filters">
        {chipCategories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`home-ideal__chip home-ideal__chip--${category.id} ds-chip${activeCategory === category.id ? " home-ideal__chip--active ds-chip--active" : ""}`}
            onClick={() => onCategoryChange(activeCategory === category.id ? "all" : category.id)}
          >
            <span className={`home-ideal__chip-icon home-ideal__chip-icon--${category.id}`} aria-hidden>
              {category.id === "careers" ? <IconRefer /> : null}
              {category.id === "guidance" ? <IconRefer /> : null}
              {category.id === "relocation" ? <IconCity /> : null}
              {category.id === "startups" ? <IconBriefcase /> : null}
              {category.id === "replies" ? <IconChatBubble /> : null}
            </span>
            {category.label}
            <span className="home-ideal__chip-count">{categoryCounts[category.id]}</span>
          </button>
        ))}
      </div>
      ) : null}
      {showingReplies ? (
        bulletinRepliesLoading ? (
          <div className="home-ideal__empty" role="status" aria-live="polite">
            <p>Loading replies…</p>
          </div>
        ) : replyRows.length === 0 ? (
          <div className="home-ideal__empty">
            <p>No replies to your posts yet.</p>
          </div>
        ) : (
          <div className="home-ideal__opportunity-feed home-ideal__opportunity-feed--rows" role="region" aria-label="Replies to your posts">
            <IntentcastActivityRowsList
              rows={replyRows}
              viewerPersonId={viewerPersonId}
              deleteSubmittingId={deleteSubmittingId}
              onRequestDelete={setDeleteConfirmId}
              ownerDeleteMenu={false}
            />
          </div>
        )
      ) : opportunitiesFeedLoading ? (
        <div className="home-ideal__empty" role="status" aria-live="polite">
          <p>Loading active requests…</p>
        </div>
      ) : activityRows.length === 0 && opportunitiesFeedError ? (
        <div className="home-ideal__empty" role="alert">
          <p>We couldn't load posts just now. Try again in a moment.</p>
        </div>
      ) : activityRows.length === 0 ? (
        // Nothing posted yet: the header line and "Post to The Wall" carry it (no "it's quiet" message).
        feedIsEmpty ? null : (
          <div className="home-ideal__empty">
            <p>No posts in this category yet.</p>
          </div>
        )
      ) : (
        <div className="home-ideal__opportunity-feed home-ideal__opportunity-feed--rows" role="region" aria-label="Active requests">
          <IntentcastActivityRowsList
            rows={activityRows}
            viewerPersonId={viewerPersonId}
            deleteSubmittingId={deleteSubmittingId}
            onRequestDelete={setDeleteConfirmId}
          />
        </div>
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
