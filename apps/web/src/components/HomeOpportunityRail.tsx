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
// PARKED 2026-11-18: Wall topic chips removed from the toolbar for now (beta feed too sparse
// for two filter dimensions). Component, styles and tests are kept; uncomment to restore.
// import { HomeWallTopicsFilter } from "./HomeWallTopicsFilter";
import { normalizeOpportunityCard, type HomeOpportunityFeedLane } from "../lib/intentcastOpportunityCard";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import { isFeedEmpty } from "../lib/emptyFeedDefense";
import { IntentcastActivityRowsList, type CareerFeedRowModel } from "./CareerIntentFeedRows";
import { WallEmptyPrompt } from "./WallEmptyPrompt";
import { useWallShareTarget } from "../hooks/useWallShareTarget";
import { LineIcon } from "./LineIcon";
import "../styles/hub-cards.css";

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
  canManageWallPins?: boolean;
  bulletinRepliesFeed?: ReceivedBulletinRepliesFeedResponse;
  bulletinRepliesLoading?: boolean;
  /** Opens the post composer; powers the "be the first to ask" button on an empty feed. */
  /** Opens the post flow ("Post to The Wall"). */
  /** Empty Wall only: the example card opens the composer (the header Post button was removed in the Home redesign). */
  onPost?: () => void;
};

// PARKED 2026-11-18: category list only fed the parked topic chips below.
// const CATEGORIES: Array<{ id: Exclude<HomeOpportunityCategory, "all">; label: string }> = [
//   { id: "careers", label: "Careers" },
//   { id: "relocation", label: "Relocation" },
//   { id: "startups", label: "Startups" },
//   { id: "guidance", label: "Guidance" },
// ];

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
    // Reply rows do not carry responder institution data; the Wall byline omits it.
    authorInstitutionName: null,
    roleHeader: postHeadline,
    companySubtitle: null,
    summary: reply.responseMessage,
    chips: [chip],
    kindLabel: null,
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
  // PARKED 2026-11-18: onCategoryChange is no longer destructured - only the parked topic
  // chips consumed it. The prop stays in the interface; restore with the chips.
  categoryCounts,
  opportunitiesFeedLoading = false,
  opportunitiesFeedError = false,
  viewerPersonId = null,
  canManageWallPins = false,
  bulletinRepliesFeed,
  bulletinRepliesLoading = false,
  onPost,
}: HomeOpportunityRailProps) {
  const queryClient = useQueryClient();
  // Opened from a shared post link (#wall-<id>): find it, scroll to it, mark it "Shared with you".
  const showAllPosts = useCallback(() => {}, []);
  const share = useWallShareTarget({
    intentcasts,
    feedLoading: opportunitiesFeedLoading,
    ensureVisible: showAllPosts,
  });
  const showingReplies = activeCategory === "replies";
  const filteredIntentcasts = (
    showingReplies ? [] : activeCategory === "all" ? intentcasts : intentcasts.filter((ic) => intentcastHomeLane(ic) === activeCategory)
  ).slice(0, HOME_OPPORTUNITY_RAIL_PAGE_SIZE);

  const wallPins = new Map(filteredIntentcasts.filter((ic) => ic.wallPinnedAt).map((ic) => [ic.id, ic.wallPinnedAt!]));
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const toggleWallPin = async (id: string, pinned: boolean) => {
    if (pinBusy || !canManageWallPins) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const { error } = await api.patch(`/v1/admin/intentcasts/${id}/pin`, { pinned });
      if (error) { setPinError(error.message ?? "Could not update pin. Try again."); return; }
      await queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
    } catch {
      setPinError("Could not update pin. Try again.");
    } finally {
      setPinBusy(false);
    }
  };

  // A shared post that isn't in the loaded page shows first.
  const withShared =
    share.extraPost && !filteredIntentcasts.some((ic) => ic.id === share.extraPost!.id)
      ? [share.extraPost, ...filteredIntentcasts]
      : filteredIntentcasts;
  const activityRows: CareerFeedRowModel[] = withShared
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
  // PARKED 2026-11-18: chip derivation for the parked topic chips.
  // const chipIds = visibleCategoryIds(CATEGORIES.map((c) => c.id), categoryCounts);
  // const chipCategories = CATEGORIES.filter((c) => chipIds.includes(c.id));

  return (
    <section className="home-ideal__opportunities ds-surface-card" aria-labelledby="home-opportunities-heading">
      <header className="home-ideal__opportunities-header ds-section-head">
        <span className="hub-card__icon home-wall__icon" aria-hidden>
          <LineIcon name="bolt" />
        </span>
        <div className="home-ideal__opportunities-headcopy">
          {/* The Wall, ranked for the viewer (GET /v1/intentcasts?scope=home_wall&sort=for_you). */}
          <h2 id="home-opportunities-heading" className="home-ideal__opportunities-title ds-title-lg">
            Opportunities for you
          </h2>
          <p className="home-ideal__opportunities-sub">Roles, collaborations and other relevant asks from alumni.</p>
        </div>
      </header>
      {pinError ? <p role="alert" className="home-ideal__opportunity-rail-error">{pinError}</p> : null}
      {share.notice ? (
        <p role="status" className="home-ideal__opportunity-rail-error wall-share-notice">
          {share.notice}{" "}
          <button type="button" className="wall-share-notice__dismiss" onClick={share.dismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}
      {railDeleteError ? (
        <p className="home-dashboard__bulletin-inline-error home-ideal__opportunity-rail-error" role="alert">
          {railDeleteError}
        </p>
      ) : null}
      <div>
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
        // Nothing posted yet: a blank card types example posts, then points at "Post to The Wall".
        feedIsEmpty ? (
          onPost ? <WallEmptyPrompt onPost={onPost} /> : null
        ) : (
          <div className="home-ideal__empty">
            <p>No posts in this category yet.</p>
          </div>
        )
      ) : (
        <div className="home-ideal__opportunity-feed home-ideal__opportunity-feed--rows" role="region" aria-label="Active requests">
          <IntentcastActivityRowsList
            rows={activityRows}
            linkifyBody
            wallPins={wallPins}
            shareable
            highlightedId={share.highlightedId}
            onToggleWallPin={canManageWallPins ? (id, pinned) => { void toggleWallPin(id, pinned); } : undefined}
            pinSubmitting={pinBusy}
            viewerPersonId={viewerPersonId}
            deleteSubmittingId={deleteSubmittingId}
            onRequestDelete={setDeleteConfirmId}
          />

        </div>
      )}
      </div>
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
