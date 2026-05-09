import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import {
  api,
  type IntentcastFeedItem,
  type IntentcastFeedResponse,
  type IntentcastSingleResponse,
  type IntentcastResponseItem,
} from "../api/client";
import { Button } from "./Button";
import { Avatar } from "./Avatar";
import {
  BULLETIN_AUTHOR_DELETE_RETENTION_DAYS,
  BULLETIN_AUTHOR_DELETE_UNDO_MINUTES,
  BULLETIN_POST_MAX_LENGTH,
  BULLETIN_REPLY_MAX_LENGTH,
} from "../constants/bulletin";
import {
  parseHiringBulletin,
  postedByShortLabel,
  splitHiringDetailsForCard,
  type ParsedHiringBulletin,
} from "../lib/parseHiringBulletin";
import { buildIntentcastFeedQuery, buildVisibleIntentcasts } from "./bulletinFeedHelpers";
import { patchIntentcastInFeedCache, prependIntentcastToFeedCache } from "./bulletinCacheHelpers";
import { demoDisplayFullName } from "../lib/demoProfile";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import {
  formatBatchYearShort,
  intentcastCategoryBadgeLabel,
  intentcastCategoryToTone,
  splitBulletinPostBody,
  validateGeneralBulletinHeadlineDetails,
} from "../lib/bulletinPostCardUtils";
import { BulletinDeleteIntentcastDialog } from "./BulletinDeleteIntentcastDialog";
import { DemoAuthorBadge } from "./DemoAuthorBadge";
import { BulletinOwnPostMenu } from "./BulletinOwnPostMenu";
import { BulletinPostCard } from "./BulletinPostCard";
import { useBulletinComposeState } from "./useBulletinComposeState";
import { useBulletinDialogController } from "./useBulletinDialogController";

function hiringPreviewIntentcast(authorFullName: string, content: string): IntentcastFeedItem {
  const now = new Date().toISOString();
  return {
    id: "__preview__",
    authorPersonId: "",
    authorFullName,
    authorDepartmentCode: null,
    authorDepartmentName: null,
    authorBatchYear: null,
    authorCurrentRoleTitle: null,
    authorCurrentOrganizationName: null,
    category: "hiring",
    content,
    status: "open",
    expiresAt: now,
    closedAt: null,
    createdAt: now,
    editableUntil: now,
    responseCount: 0,
    viewerHasResponded: false,
    authorIsDemo: false,
  };
}

const HIRING_COMPOSE_MAX_LENGTH = 700;

const BULLETIN_HIGHLIGHT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BulletinCategory = IntentcastFeedItem["category"];

export type BulletinPanelHandle = {
  openCompose: () => void;
};

export type BulletinFeedMeta = {
  status: "loading" | "ready" | "error";
  loadedCount: number;
  mayHaveMore: boolean;
};

export type BulletinPanelProps = {
  feedReady: boolean;
  domIdPrefix?: string;
  title?: string;
  caption?: string;
  className?: string;
  /** When false, omits the title/caption block inside the panel (e.g. career hub supplies its own headline). Default true. */
  showPanelHeader?: boolean;
  /** `career` = flat panel on cream (no frosted shell). */
  layout?: "default" | "career";
  onFeedMetaChange?: (meta: BulletinFeedMeta) => void;
  /** When set, feed requests only this category (e.g. Career hiring). */
  lockedCategoryFilter?: BulletinCategory;
  /** When false, skips loading/rendering the feed; compose CTA and form still work (e.g. Career “Post a role” tab). */
  showFeed?: boolean;
  /** When true, the + Compose control is omitted (parent supplies its own opener, e.g. Career post tab). */
  hideComposeCta?: boolean;
  /** `GET /v1/intentcasts?mine=true` — only the signed-in author’s posts. */
  feedMine?: boolean;
  /** `authorHistory=true` (requires `feedMine`): include closed / past-`expires_at` rows for the author. */
  feedAuthorHistory?: boolean;
  /**
   * When true, `GET /v1/intentcasts` uses `excludeAuthorSoftDeleted=true` — removed posts are omitted for every viewer.
   * Use on Career **Opportunities** so deleted hiring posts never appear there, even for the author.
   */
  feedExcludeAuthorSoftDeleted?: boolean;
  /** For the viewer’s posts, fetch and show `GET …/responses` under each card (author-only API). */
  showInlineAuthorReplies?: boolean;
  /** Disables the opportunistic auto-scroll ticker (e.g. Career “Post a role” list). */
  feedDisableAutoScroll?: boolean;
  /** When `panelStart`, compose form renders at the top of the panel (e.g. Career replaces page intro). Default `panelEnd`. */
  composePlacement?: "panelEnd" | "panelStart";
  /** Notified when the compose sheet opens or closes (e.g. parent hides duplicate headline). */
  onComposeOpenChange?: (open: boolean) => void;
};

/** Returns intentcast id from `#${prefix}-{uuid}` or null. */
function bulletinHighlightIntentcastId(hash: string, domIdPrefix: string): string | null {
  const raw = hash.replace(/^#/, "");
  const p = `${domIdPrefix}-`;
  if (!raw.startsWith(p)) return null;
  const id = raw.slice(p.length);
  return BULLETIN_HIGHLIGHT_UUID_RE.test(id) ? id : null;
}

/** Vertical auto-scroll in the bulletin list (~24px/s at 60fps); off when `prefers-reduced-motion: reduce`. */
const BULLETIN_AUTO_SCROLL_PX_PER_FRAME = 0.4;
const BULLETIN_AUTO_SCROLL_WHEEL_PAUSE_MS = 12_000;

function safeFullName(fullName: string | null | undefined): string {
  const raw = (fullName ?? "").trim();
  return demoDisplayFullName(raw) || raw;
}

/** Dept code + batch for author tooltip (e.g. `CSE '21`). */
function formatAuthorDeptBatchForTooltip(ic: IntentcastFeedItem): string | null {
  const dept = ic.authorDepartmentCode?.trim().toUpperCase() ?? "";
  const batch =
    ic.authorBatchYear != null && Number.isFinite(ic.authorBatchYear)
      ? formatBatchYearShort(ic.authorBatchYear)
      : "";
  if (dept && batch) return `${dept} ${batch}`;
  if (dept) return dept;
  if (batch) return `Batch ${batch}`;
  return null;
}

/** Current role and organization from feed occupation join. */
function formatAuthorRoleCompanyForTooltip(ic: IntentcastFeedItem): string | null {
  const role = ic.authorCurrentRoleTitle?.trim();
  const org = ic.authorCurrentOrganizationName?.trim();
  if (role && org) return `${role} · ${org}`;
  if (role) return role;
  if (org) return org;
  return null;
}

/** High-level role family chip (Product / Consulting / SDE / ...), inferred from title/details. */
function inferHiringTrackChip(parsed: ParsedHiringBulletin): string | null {
  const hay = `${parsed.title} ${parsed.description}`.toLowerCase();

  if (/\b(product|pm|product manager|product management)\b/.test(hay)) return "Product";
  if (/\b(consult(ing|ant)|advisory|strategy)\b/.test(hay)) return "Consulting";
  if (/\b(sde|software|backend|frontend|full\s*stack|developer|engineer)\b/.test(hay)) return "SDE";
  if (/\b(design|ux|ui|product designer)\b/.test(hay)) return "Design";
  if (/\b(data scientist|data science|ml|machine learning|ai engineer|analytics)\b/.test(hay)) return "Data/AI";
  if (/\b(marketing|growth|brand|content)\b/.test(hay)) return "Marketing";
  if (/\b(sales|business development|account executive)\b/.test(hay)) return "Sales";
  if (/\b(finance|fp&a|investment|accounting)\b/.test(hay)) return "Finance";
  if (/\b(hr|talent|recruit(er|ing)|people operations)\b/.test(hay)) return "People";

  return null;
}

/** Track "Other" posts are held for admin verification before Opportunities tab visibility. */
function hiringPostNeedsTrackVerification(content: string): boolean {
  const parsed = parseHiringBulletin(content);
  const source = parsed?.description ?? content;
  return /Role track:\s*Other\b/i.test(source);
}

function intentcastIsOpen(ic: IntentcastFeedItem): boolean {
  return ic.status === "open";
}

/** Author may PATCH content/category until `editableUntil` (server: 5 minutes after create). */
function intentcastWithinEditWindow(ic: IntentcastFeedItem): boolean {
  return intentcastIsOpen(ic) && Date.parse(ic.editableUntil) > Date.now();
}

function formatEditWindowHint(editableUntilIso: string): string | null {
  const ms = Date.parse(editableUntilIso) - Date.now();
  if (ms <= 0) return null;
  const min = Math.ceil(ms / 60_000);
  if (min <= 1) return "You can edit for about a minute.";
  return `You can edit for about ${min} more minutes.`;
}

function intentcastIsAuthorRemoved(ic: IntentcastFeedItem): boolean {
  return Boolean(ic.authorSoftDeletedAt);
}

function formatAuthorPurgeDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Explains purge date = N days after removal (server retention), not “deleted today”. */
function AuthorPermanentDeletionNote({ ic }: { ic: IntentcastFeedItem }) {
  const purgeIso = ic.authorDeletePurgeAt;
  if (!purgeIso) return null;
  const dateLabel = formatAuthorPurgeDate(purgeIso);
  if (!dateLabel) return null;
  const removedIso = ic.authorSoftDeletedAt;
  let retentionPhrase = "";
  if (removedIso) {
    const purgeMs = Date.parse(purgeIso);
    const removedMs = Date.parse(removedIso);
    if (!Number.isNaN(purgeMs) && !Number.isNaN(removedMs) && purgeMs > removedMs) {
      const days = Math.max(1, Math.round((purgeMs - removedMs) / 86_400_000));
      const defaultDays = BULLETIN_AUTHOR_DELETE_RETENTION_DAYS;
      retentionPhrase =
        days === defaultDays
          ? ` That is ${defaultDays} days after you removed it from the bulletin (our default retention).`
          : ` That is ${days} ${days === 1 ? "day" : "days"} after you removed it from the bulletin.`;
    }
  }
  return (
    <p className="home-dashboard__bulletin-archived-copy">
      We permanently delete this private copy on <strong>{dateLabel}</strong>.{retentionPhrase}
    </p>
  );
}

function intentcastAuthorDeleteUndoDeadlineMs(removedIso: string): number {
  return Date.parse(removedIso) + BULLETIN_AUTHOR_DELETE_UNDO_MINUTES * 60 * 1000;
}

function AuthorDeleteUndoRow({
  ic,
  viewerPersonId,
  undoClock,
  restoreSubmitting,
  onRestore,
}: {
  ic: IntentcastFeedItem;
  viewerPersonId: string | undefined;
  undoClock: number;
  restoreSubmitting: boolean;
  onRestore: () => void;
}) {
  if (!viewerPersonId || ic.authorPersonId !== viewerPersonId) return null;
  const removed = ic.authorSoftDeletedAt;
  if (!removed || Number.isNaN(Date.parse(removed))) return null;
  const deadlineMs = intentcastAuthorDeleteUndoDeadlineMs(removed);
  if (undoClock >= deadlineMs) return null;
  const msLeft = deadlineMs - undoClock;
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <div className="home-dashboard__bulletin-undo-delete">
      <p className="home-dashboard__bulletin-archived-copy">
        Changed your mind? Restore within <strong>{timeLabel}</strong>.
      </p>
      <Button type="button" variant="secondary" disabled={restoreSubmitting} onClick={onRestore}>
        {restoreSubmitting ? "Restoring…" : "Restore to bulletin"}
      </Button>
    </div>
  );
}

function intentcastReplyDisplayName(r: IntentcastResponseItem): string {
  return r.responderFullName?.trim() || "Alumni";
}

function CareerOpportunityPosterRow({
  ic,
  composePreview,
}: {
  ic: IntentcastFeedItem;
  composePreview: boolean;
}) {
  const tooltipId = useId();
  if (composePreview) return null;

  const authorName = safeFullName(ic.authorFullName);
  const displayName = authorName || "Alumni";
  const deptBatch = formatAuthorDeptBatchForTooltip(ic);
  const roleCompany = formatAuthorRoleCompanyForTooltip(ic);

  const inner = (
    <>
      <Avatar
        name={authorName}
        size="sm"
        tone="pastel"
        className="career-opportunity-card__avatar"
      />
      <span className="career-opportunity-card__posted-by-row">
        <span className="career-opportunity-card__posted-by">
          Posted by {postedByShortLabel(authorName || "Alumni")}
        </span>
        {ic.authorIsDemo ? <DemoAuthorBadge /> : null}
      </span>
    </>
  );

  if (ic.authorPersonId) {
    return (
      <div className="career-opportunity-card__poster">
        <div className="career-opportunity-card__avatar-tip">
          <Link
            to={`/profiles/${ic.authorPersonId}`}
            className="career-opportunity-card__avatar-link"
            aria-describedby={tooltipId}
            aria-label={`View ${displayName}'s profile`}
          >
            <Avatar
              name={authorName}
              size="sm"
              tone="pastel"
              className="career-opportunity-card__avatar"
            />
          </Link>
          <div id={tooltipId} className="career-opportunity-card__avatar-tooltip" role="tooltip">
            <span className="career-opportunity-card__avatar-tooltip-name">{displayName}</span>
            {deptBatch ? (
              <span className="career-opportunity-card__avatar-tooltip-meta">{deptBatch}</span>
            ) : null}
            {roleCompany ? (
              <span className="career-opportunity-card__avatar-tooltip-role">{roleCompany}</span>
            ) : null}
          </div>
        </div>
        <Link
          to={`/profiles/${ic.authorPersonId}`}
          className="career-opportunity-card__poster-text-link"
          aria-label={`View ${displayName}'s profile`}
        >
          <span className="career-opportunity-card__posted-by-row">
            <span className="career-opportunity-card__posted-by">
              Posted by {postedByShortLabel(authorName || "Alumni")}
            </span>
            {ic.authorIsDemo ? <DemoAuthorBadge /> : null}
          </span>
        </Link>
      </div>
    );
  }

  return <div className="career-opportunity-card__poster">{inner}</div>;
}

function CareerOpportunityCardBody({
  ic,
  parsed,
  composePreview = false,
  viewerHasReplied = false,
}: {
  ic: IntentcastFeedItem;
  parsed: ParsedHiringBulletin | null;
  /** Omits poster row and timestamp so the compose form preview reads as draft layout, not a duplicate feed card. */
  composePreview?: boolean;
  viewerHasReplied?: boolean;
}) {
  const cardClass = `career-opportunity-card${composePreview ? " career-opportunity-card--compose-preview" : ""}`;

  if (!parsed) {
    return (
      <div className={cardClass}>
        <div className="career-opportunity-card__top">
          <div className="career-opportunity-card__chips" aria-hidden />
          <CareerOpportunityPosterRow ic={ic} composePreview={composePreview} />
        </div>
        <h3 className="career-opportunity-card__headline career-opportunity-card__headline--unparsed">{ic.content.trim()}</h3>
        {!composePreview && ic.createdAt ? (
          <div className="career-opportunity-card__footer">
            {viewerHasReplied ? (
              <span className="career-opportunity-card__you-replied">You replied.</span>
            ) : null}
            <time className="career-opportunity-card__time" dateTime={ic.createdAt}>
              {formatRelativeTime(ic.createdAt)}
            </time>
          </div>
        ) : null}
      </div>
    );
  }

  const sections = splitHiringDetailsForCard(parsed.description);
  const hasStructured =
    Boolean(sections.roleSummary.trim()) ||
    Boolean(sections.jdUrl) ||
    Boolean(sections.applySteps.trim());
  const showFallbackDescription = Boolean(parsed.description.trim()) && !hasStructured;

  const chipTrack = inferHiringTrackChip(parsed);
  const rawLocation = parsed.locationLine.trim();
  const chipLocation = rawLocation ? `Location - ${rawLocation}` : "";
  const chipYoE = parsed.experienceLabel?.trim();
  const chipComp = parsed.salaryLabel?.trim();

  return (
    <div className={cardClass}>
      <div className="career-opportunity-card__top">
        <div className="career-opportunity-card__chips" aria-label="Role highlights">
          {chipTrack ? <span className="career-opportunity-card__chip">{chipTrack}</span> : null}
          {chipLocation ? (
            <span className="career-opportunity-card__chip">{chipLocation}</span>
          ) : null}
          {chipYoE ? <span className="career-opportunity-card__chip">{chipYoE}</span> : null}
          {chipComp ? <span className="career-opportunity-card__chip">{chipComp}</span> : null}
        </div>
        <CareerOpportunityPosterRow ic={ic} composePreview={composePreview} />
      </div>

      <h3 className="career-opportunity-card__headline">
        <span className="career-opportunity-card__role">{parsed.title}</span>
        <span className="career-opportunity-card__headline-sep" aria-hidden>
          {" "}
          @{" "}
        </span>
        <span className="career-opportunity-card__company-inline">{parsed.company}</span>
      </h3>

      {sections.jdUrl ? (
        <p className="career-opportunity-card__jd">
          <a className="career-opportunity-card__jd-link" href={sections.jdUrl} target="_blank" rel="noopener noreferrer">
            View full job description
          </a>
        </p>
      ) : null}
      {sections.applySteps ? (
        <div className="career-opportunity-card__apply">
          <p className="career-opportunity-card__apply-label">Steps to apply</p>
          <p className="career-opportunity-card__apply-text">{sections.applySteps}</p>
        </div>
      ) : null}
      {showFallbackDescription ? <p className="career-opportunity-card__description">{parsed.description}</p> : null}

      {!composePreview && ic.createdAt ? (
        <div className="career-opportunity-card__footer">
          {viewerHasReplied ? (
            <span className="career-opportunity-card__you-replied">You replied.</span>
          ) : null}
          <time className="career-opportunity-card__time" dateTime={ic.createdAt}>
            {formatRelativeTime(ic.createdAt)}
          </time>
        </div>
      ) : null}
    </div>
  );
}

function ComposeDialog({
  open,
  domIdPrefix,
  postSubmitting,
  composeDialogRef,
  onRequestClose,
  children,
}: {
  open: boolean;
  domIdPrefix: string;
  postSubmitting: boolean;
  composeDialogRef: React.RefObject<HTMLDivElement | null>;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="home-dashboard__bulletin-compose-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !postSubmitting) onRequestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${domIdPrefix}-compose-title`}
        className="home-dashboard__bulletin-compose-dialog"
        ref={composeDialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="home-dashboard__bulletin-compose-close"
          aria-label="Close new hiring post dialog"
          onClick={onRequestClose}
          disabled={postSubmitting}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function FeedList({
  showFeed,
  status,
  errorMessage,
  emptyMessage,
  onRetry,
  children,
}: {
  showFeed: boolean;
  status: "loading" | "ready" | "error";
  errorMessage: string | null;
  emptyMessage: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (!showFeed) return null;
  if (status === "loading") {
    return (
      <div className="home-dashboard__bulletin-state" role="status" aria-live="polite">
        <p className="home-dashboard__bulletin-state-title">Loading active requests</p>
        <p className="home-dashboard__bulletin-state-copy">Pulling the latest updates from alumni…</p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="home-dashboard__bulletin-state home-dashboard__bulletin-state--error">
        <p className="home-dashboard__bulletin-state-title">Couldn’t load active requests</p>
        <p className="home-dashboard__bulletin-state-copy">{errorMessage ?? "Please retry in a moment."}</p>
        <button type="button" className="home-dashboard__bulletin-state-action" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (!children) {
    return (
      <div className="home-dashboard__bulletin-state">
        <p className="home-dashboard__bulletin-state-title">No posts yet</p>
        <p className="home-dashboard__bulletin-state-copy">{emptyMessage}</p>
      </div>
    );
  }
  return <>{children}</>;
}

export const BulletinPanel = forwardRef<BulletinPanelHandle, BulletinPanelProps>(
  function BulletinPanel(
    {
      feedReady,
      domIdPrefix = "home-bulletin",
      title = "Active Requests",
      caption = "What fellow alums are sharing",
      className,
      showPanelHeader = true,
      layout = "default",
      onFeedMetaChange,
      lockedCategoryFilter,
      showFeed = true,
      hideComposeCta = false,
      feedMine = false,
      feedAuthorHistory = false,
      feedExcludeAuthorSoftDeleted = false,
      showInlineAuthorReplies = false,
      feedDisableAutoScroll = false,
      onComposeOpenChange,
    },
    ref
  ) {
    const auth = useAuth();
    const location = useLocation();
    const authPersonId = auth.status === "authenticated" ? auth.person.personId : undefined;
    const personId = authPersonId;
    const panelRootRef = useRef<HTMLElement | null>(null);
    const composePreviewSurfaceRef = useRef<HTMLDivElement | null>(null);
    const morphTargetIntentcastIdRef = useRef<string | null>(null);
    const morphSourceRectRef = useRef<DOMRect | null>(null);
    const [morphPostedIntentcast, setMorphPostedIntentcast] = useState<IntentcastFeedItem | null>(null);
    const [morphRects, setMorphRects] = useState<{ from: DOMRect; to: DOMRect } | null>(null);
    const [morphPhase, setMorphPhase] = useState<"idle" | "compressing" | "expanding">("idle");

    const highlightIntentcastId = useMemo(
      () => bulletinHighlightIntentcastId(location.hash, domIdPrefix),
      [location.hash, domIdPrefix]
    );

    const effectiveCategoryFilter = lockedCategoryFilter ?? null;
    const [bulletinFeedRetryNonce, setBulletinFeedRetryNonce] = useState(0);
    const bulletinScrollRef = useRef<HTMLDivElement>(null);
    const bulletinSentinelRef = useRef<HTMLDivElement>(null);
    const bulletinAutoScrollPauseRef = useRef({ pointerInside: false, focusInside: false, wheelUntil: 0 });

    const buildFeedQuery = useCallback(
      (offset: number) =>
        buildIntentcastFeedQuery(offset, {
          category: effectiveCategoryFilter,
          mine: feedMine,
          authorHistory: feedAuthorHistory,
          excludeAuthorSoftDeleted: feedExcludeAuthorSoftDeleted,
        }),
      [effectiveCategoryFilter, feedMine, feedAuthorHistory, feedExcludeAuthorSoftDeleted]
    );

    const queryClient = useQueryClient();
    const feedEnabled =
      showFeed && auth.status === "authenticated" && feedReady && Boolean(personId);

    const feedQueryKey = useMemo(
      () =>
        queryKeys.intentcasts.feedInfinite({
          category: effectiveCategoryFilter,
          mine: feedMine,
          authorHistory: feedAuthorHistory,
          excludeAuthorSoftDeleted: feedExcludeAuthorSoftDeleted,
          retryNonce: bulletinFeedRetryNonce,
        }),
      [
        effectiveCategoryFilter,
        feedMine,
        feedAuthorHistory,
        feedExcludeAuthorSoftDeleted,
        bulletinFeedRetryNonce,
      ]
    );

    const feedInfinite = useInfiniteQuery({
      queryKey: feedQueryKey,
      queryFn: async ({ pageParam, signal }) => {
        const offset = pageParam as number;
        const q = buildFeedQuery(offset);
        return assertApiGet<IntentcastFeedResponse>(`/v1/intentcasts?${q}`, signal);
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.pageInfo.nextOffset ?? undefined,
      enabled: feedEnabled,
    });

    const feedFlat = useMemo(() => {
      if (!showFeed || !feedInfinite.data) return [];
      return feedInfinite.data.pages.flatMap((p) => p.intentcasts);
    }, [showFeed, feedInfinite.data]);

    const highlightQuery = useQuery({
      queryKey: queryKeys.intentcasts.detail(highlightIntentcastId ?? ""),
      queryFn: ({ signal }) =>
        assertApiGet<IntentcastSingleResponse>(`/v1/intentcasts/${highlightIntentcastId!}`, signal),
      enabled: Boolean(
        showFeed &&
          feedEnabled &&
          highlightIntentcastId &&
          feedInfinite.isSuccess &&
          !feedFlat.some((ic) => ic.id === highlightIntentcastId)
      ),
      retry: false,
    });

    const intentcasts = useMemo(() => {
      return buildVisibleIntentcasts({
        showFeed,
        feedFlat,
        highlightIntentcast: highlightQuery.data?.intentcast,
        viewerPersonId: personId,
        feedMine,
        feedAuthorHistory,
        feedExcludeAuthorSoftDeleted,
        applyCareerHiringFilter: layout === "career" && effectiveCategoryFilter === "hiring" && !feedMine,
        shouldHideCareerHiringPost: (ic) => hiringPostNeedsTrackVerification(ic.content),
      });
    }, [
      showFeed,
      feedFlat,
      highlightQuery.data,
      feedMine,
      feedAuthorHistory,
      feedExcludeAuthorSoftDeleted,
      personId,
      layout,
      effectiveCategoryFilter,
    ]);

    const bulletinFeedAwaitingFirstPage =
      feedInfinite.isPending ||
      (feedInfinite.isFetching && feedFlat.length === 0 && !feedInfinite.isError);
    const awaitingHighlightForEmptyFeed =
      Boolean(
        highlightIntentcastId &&
          showFeed &&
          feedEnabled &&
          (highlightQuery.isPending || highlightQuery.isFetching) &&
          feedFlat.length === 0 &&
          !highlightQuery.isError
      );

    const bulletinFeedStatus: "loading" | "ready" | "error" = !showFeed
      ? "ready"
      : !feedEnabled
        ? "loading"
        : feedInfinite.isError
          ? "error"
          : bulletinFeedAwaitingFirstPage || awaitingHighlightForEmptyFeed
            ? "loading"
            : "ready";

    const bulletinFeedError =
      feedInfinite.error instanceof Error
        ? feedInfinite.error.message
        : feedInfinite.error
          ? String(feedInfinite.error)
          : null;

    const intentcastNextOffset = feedInfinite.hasNextPage ? 1 : null;
    const intentcastsLoadingMore = feedInfinite.isFetchingNextPage;
    const intentcastsLoadMoreError = feedInfinite.isFetchNextPageError
      ? bulletinFeedError ?? "Could not load more."
      : null;

    const patchFeedItem = useCallback(
      (intentcastId: string, map: (ic: IntentcastFeedItem) => IntentcastFeedItem) => {
        patchIntentcastInFeedCache({
          queryClient,
          feedQueryKey,
          intentcastId,
          map,
        });
      },
      [queryClient, feedQueryKey]
    );

    const prependFeedIntentcast = useCallback(
      (posted: IntentcastFeedItem) => {
        prependIntentcastToFeedCache({
          queryClient,
          feedQueryKey,
          posted,
        });
      },
      [queryClient, feedQueryKey]
    );

    const [respondTargetId, setRespondTargetId] = useState<string | null>(null);
    const [respondMessage, setRespondMessage] = useState("");
    const [respondSubmitting, setRespondSubmitting] = useState(false);
    const [respondError, setRespondError] = useState<string | null>(null);
    const [repliedIntentcastIds, setRepliedIntentcastIds] = useState<Set<string>>(() => new Set());
    const [editIntentcastId, setEditIntentcastId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const {
      postOpen,
      setPostOpen,
      postSubmitting,
      setPostSubmitting,
      postError,
      setPostError,
      hiringCompany,
      setHiringCompany,
      hiringTitle,
      setHiringTitle,
      hiringTrackChoice,
      setHiringTrackChoice,
      hiringTrackOther,
      setHiringTrackOther,
      hiringLocation,
      setHiringLocation,
      hiringExperience,
      setHiringExperience,
      hiringCompensation,
      setHiringCompensation,
      hiringRoleSummary,
      setHiringRoleSummary,
      hiringJdUrl,
      setHiringJdUrl,
      hiringApplySteps,
      setHiringApplySteps,
      hiringComposeBody,
      hiringPreviewBody,
      resetComposeFields,
      openCompose,
      validatePostInput,
    } = useBulletinComposeState({ maxLength: HIRING_COMPOSE_MAX_LENGTH });
    // const [hiringEmploymentType, setHiringEmploymentType] = useState("Full-time");
    const hiringSummaryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const hiringApplyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [deleteSubmittingId, setDeleteSubmittingId] = useState<string | null>(null);
    const [deleteConfirmIntentcastId, setDeleteConfirmIntentcastId] = useState<string | null>(null);
    const [bulletinDeleteError, setBulletinDeleteError] = useState<string | null>(null);
    const [restoreSubmittingId, setRestoreSubmittingId] = useState<string | null>(null);
    const [bulletinRestoreError, setBulletinRestoreError] = useState<string | null>(null);
    const [authorDeleteUndoTick, setAuthorDeleteUndoTick] = useState(0);
    const [archivedRepliesPostId, setArchivedRepliesPostId] = useState<string | null>(null);
    const [inlineRepliesPostId, setInlineRepliesPostId] = useState<string | null>(null);
    const deleteDialogOpen = Boolean(deleteConfirmIntentcastId);
    const composeDialogOpen = postOpen;

    const archivedRepliesQuery = useQuery({
      queryKey: queryKeys.intentcasts.responses(archivedRepliesPostId ?? ""),
      queryFn: ({ signal }) =>
        assertApiGet<{ responses: IntentcastResponseItem[] }>(
          `/v1/intentcasts/${archivedRepliesPostId!}/responses`,
          signal
        ),
      enabled: Boolean(archivedRepliesPostId),
      retry: false,
    });

    const archivedReplies = archivedRepliesQuery.data?.responses ?? [];
    const archivedRepliesLoading = archivedRepliesQuery.isPending;
    const archivedRepliesError = archivedRepliesQuery.isError
      ? archivedRepliesQuery.error instanceof Error
        ? archivedRepliesQuery.error.message
        : String(archivedRepliesQuery.error)
      : null;

    const inlineRepliesQuery = useQuery({
      queryKey: queryKeys.intentcasts.responses(inlineRepliesPostId ?? ""),
      queryFn: ({ signal }) =>
        assertApiGet<{ responses: IntentcastResponseItem[] }>(
          `/v1/intentcasts/${inlineRepliesPostId!}/responses`,
          signal
        ),
      enabled: Boolean(showInlineAuthorReplies && inlineRepliesPostId),
      retry: false,
    });
    const inlineReplies = inlineRepliesQuery.data?.responses ?? [];
    const inlineRepliesLoading = inlineRepliesQuery.isPending;
    const inlineRepliesError = inlineRepliesQuery.isError
      ? inlineRepliesQuery.error instanceof Error
        ? inlineRepliesQuery.error.message
        : String(inlineRepliesQuery.error)
      : null;

    useEffect(() => {
      onComposeOpenChange?.(postOpen);
    }, [postOpen, onComposeOpenChange]);

    const { composeDialogRef, deleteDialogRef } = useBulletinDialogController({
      composeDialogOpen,
      deleteDialogOpen,
      postSubmitting,
      deleteSubmittingLocked: deleteSubmittingId != null,
      onCloseCompose: () => setPostOpen(false),
      onCloseDelete: () => setDeleteConfirmIntentcastId(null),
    });

    const hasAuthorDeleteUndoCandidate = useMemo(
      () =>
        personId != null &&
        intentcasts.some((ic) => ic.authorPersonId === personId && ic.authorSoftDeletedAt),
      [intentcasts, personId]
    );

    useEffect(() => {
      if (!hasAuthorDeleteUndoCandidate) return;
      const id = window.setInterval(() => setAuthorDeleteUndoTick((n) => n + 1), 1000);
      return () => window.clearInterval(id);
    }, [hasAuthorDeleteUndoCandidate]);

    useEffect(() => {
      if (!showFeed) return;
      onFeedMetaChange?.({
        status: bulletinFeedStatus,
        loadedCount: intentcasts.length,
        mayHaveMore: Boolean(feedInfinite.hasNextPage),
      });
    }, [
      showFeed,
      bulletinFeedStatus,
      intentcasts.length,
      feedInfinite.hasNextPage,
      onFeedMetaChange,
    ]);

    useEffect(() => {
      if (bulletinFeedStatus !== "ready") return;
      const domId = location.hash.replace(/^#/, "");
      if (!domId.startsWith(`${domIdPrefix}-`)) return;
      const el = document.getElementById(domId);
      if (!el) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }, [bulletinFeedStatus, intentcasts, location.hash, domIdPrefix]);

    useEffect(() => {
      if (!showFeed) return;
      bulletinScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, [showFeed, effectiveCategoryFilter, feedMine, feedAuthorHistory, feedExcludeAuthorSoftDeleted]);

    const autosizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => {
      autosizeTextarea(hiringSummaryTextareaRef.current);
    }, [hiringRoleSummary, autosizeTextarea]);

    useEffect(() => {
      autosizeTextarea(hiringApplyTextareaRef.current);
    }, [hiringApplySteps, autosizeTextarea]);

    const loadMoreIntentcasts = useCallback(() => {
      if (!feedInfinite.hasNextPage || feedInfinite.isFetchingNextPage) return;
      void feedInfinite.fetchNextPage();
    }, [feedInfinite]);

    useEffect(() => {
      const root = bulletinScrollRef.current;
      const sentinel = bulletinSentinelRef.current;
      if (!root || !sentinel || !feedInfinite.hasNextPage || intentcastsLoadingMore) return;

      const io = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (e?.isIntersecting) loadMoreIntentcasts();
        },
        { root, rootMargin: "100px 0px", threshold: 0 }
      );
      io.observe(sentinel);
      return () => io.disconnect();
    }, [feedInfinite.hasNextPage, intentcastsLoadingMore, intentcasts.length, loadMoreIntentcasts]);

    useEffect(() => {
      if (feedDisableAutoScroll) return;
      if (typeof window === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      let rafId = 0;
      const tick = () => {
        rafId = requestAnimationFrame(tick);
        const el = bulletinScrollRef.current;
        const p = bulletinAutoScrollPauseRef.current;
        if (!el) return;
        if (feedDisableAutoScroll) return;
        if (p.pointerInside || p.focusInside || Date.now() < p.wheelUntil) return;
        if (el.scrollHeight <= el.clientHeight + 1) return;
        el.scrollTop += BULLETIN_AUTO_SCROLL_PX_PER_FRAME;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          el.scrollTop = 0;
        }
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [feedDisableAutoScroll]);

    const handleRespond = async (intentcastId: string) => {
      const msg = respondMessage.trim();
      if (msg.length < 5) {
        setRespondError("Write at least 5 characters.");
        return;
      }
      if (msg.length > BULLETIN_REPLY_MAX_LENGTH) {
        setRespondError(`Reply must be at most ${BULLETIN_REPLY_MAX_LENGTH} characters.`);
        return;
      }
      setRespondError(null);
      setRespondSubmitting(true);
      const { error } = await api.post(`/v1/intentcasts/${intentcastId}/respond`, { message: msg });
      setRespondSubmitting(false);
      if (error) {
        if (error.code === "INTENTCAST_ALREADY_RESPONDED") {
          setRepliedIntentcastIds((prev) => new Set(prev).add(intentcastId));
          patchFeedItem(intentcastId, (ic) => ({ ...ic, viewerHasResponded: true }));
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.responses(intentcastId) });
          setRespondTargetId(null);
          setRespondMessage("");
          setRespondError(null);
          return;
        }
        setRespondError(error.message ?? error.code ?? "Could not send.");
        return;
      }
      setRepliedIntentcastIds((prev) => new Set(prev).add(intentcastId));
      setRespondTargetId(null);
      setRespondMessage("");
      patchFeedItem(intentcastId, (ic) => ({
        ...ic,
        responseCount: ic.responseCount + 1,
        viewerHasResponded: true,
      }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.responses(intentcastId) });
    };

    const handleSaveIntentcastEdit = async (intentcastId: string) => {
      const existing = intentcasts.find((ic) => ic.id === intentcastId);
      if (!existing) {
        setEditError("This post is no longer in the list. Refresh and try again.");
        return;
      }
      const content = editContent.trim();
      if (content.length < 10) {
        setEditError("Post must be at least 10 characters.");
        return;
      }
      if (content.length > BULLETIN_POST_MAX_LENGTH) {
        setEditError(`Post must be at most ${BULLETIN_POST_MAX_LENGTH} characters.`);
        return;
      }
      if (existing.category !== "hiring") {
        const headlineDetailsErr = validateGeneralBulletinHeadlineDetails(content);
        if (headlineDetailsErr) {
          setEditError(headlineDetailsErr);
          return;
        }
      }
      setEditError(null);
      setEditSubmitting(true);
      const { data, error } = await api.patch<{ intentcast: IntentcastFeedItem }>(
        `/v1/intentcasts/${intentcastId}`,
        { content, category: existing.category }
      );
      setEditSubmitting(false);
      if (error || !data?.intentcast) {
        setEditError(error?.message ?? error?.code ?? "Could not save changes.");
        return;
      }
      const updated = data.intentcast;
      patchFeedItem(intentcastId, () => updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
      setEditIntentcastId(null);
      setEditError(null);
    };

    const cancelIntentcastEdit = () => {
      setEditIntentcastId(null);
      setEditError(null);
      setEditContent("");
    };

    const executeRestoreIntentcast = async (intentcastId: string) => {
      setBulletinRestoreError(null);
      setRestoreSubmittingId(intentcastId);
      const { data, error } = await api.post<{ intentcast: IntentcastFeedItem }>(
        `/v1/intentcasts/${intentcastId}/restore`
      );
      setRestoreSubmittingId(null);
      if (error || !data?.intentcast) {
        setBulletinRestoreError(error?.message ?? error?.code ?? "Could not restore post.");
        return;
      }
      const updated = data.intentcast;
      patchFeedItem(intentcastId, () => updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
    };

    const executeDeleteIntentcast = async (intentcastId: string) => {
      setBulletinDeleteError(null);
      setBulletinRestoreError(null);
      setDeleteSubmittingId(intentcastId);
      const { data, error } = await api.delete<{ intentcast: IntentcastFeedItem }>(
        `/v1/intentcasts/${intentcastId}`
      );
      setDeleteSubmittingId(null);
      const handleDeleteUiCleanup = () => {
        setDeleteConfirmIntentcastId(null);
        if (editIntentcastId === intentcastId) cancelIntentcastEdit();
        if (respondTargetId === intentcastId) {
          setRespondTargetId(null);
          setRespondMessage("");
          setRespondError(null);
        }
        if (archivedRepliesPostId === intentcastId) {
          setArchivedRepliesPostId(null);
        }
      };
      if (error || !data?.intentcast) {
        if (error?.code === "INTENTCAST_ALREADY_REMOVED") {
          handleDeleteUiCleanup();
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.responses(intentcastId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
          return;
        }
        setBulletinDeleteError(error?.message ?? error?.code ?? "Could not remove post.");
        return;
      }
      const updated = data.intentcast;
      patchFeedItem(intentcastId, () => updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.responses(intentcastId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      handleDeleteUiCleanup();
    };

    const toggleArchivedReplies = (ic: IntentcastFeedItem) => {
      if (archivedRepliesPostId === ic.id) {
        setArchivedRepliesPostId(null);
        return;
      }
      setArchivedRepliesPostId(ic.id);
    };

    const toggleInlineReplies = (intentcastId: string) => {
      setInlineRepliesPostId((prev) => (prev === intentcastId ? null : intentcastId));
    };

    const hiringPreviewAuthor =
      auth.status === "authenticated"
        ? demoDisplayFullName(auth.myProfile?.fullName).trim() || auth.myProfile?.fullName?.trim() || "You"
        : "You";

    const handlePostIntentcast = async () => {
      const categoryForApi: BulletinCategory = lockedCategoryFilter ?? "hiring";
      const validationError = validatePostInput();
      if (validationError) {
        setPostError(validationError);
        return;
      }
      setPostError(null);
      setPostSubmitting(true);
      const { data, error } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: categoryForApi,
        content: hiringComposeBody,
      });
      setPostSubmitting(false);
      const posted = data?.intentcast;
      if (error || !posted) {
        setPostError(error?.message ?? error?.code ?? "Could not post bulletin.");
        return;
      }
      const matchesFilter =
        effectiveCategoryFilter == null || posted.category === effectiveCategoryFilter;
      const sourceRect = composePreviewSurfaceRef.current?.getBoundingClientRect() ?? null;
      const shouldAnimatePublish = matchesFilter && sourceRect != null;

      if (shouldAnimatePublish && sourceRect) {
        morphSourceRectRef.current = sourceRect;
        morphTargetIntentcastIdRef.current = posted.id;
        setMorphPostedIntentcast(posted);
        setMorphRects({ from: sourceRect, to: sourceRect });
        setMorphPhase("compressing");
      }

      if (matchesFilter) {
        prependFeedIntentcast(posted);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(posted.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      resetComposeFields();
      if (shouldAnimatePublish) {
        window.setTimeout(() => {
          setPostOpen(false);
        }, 180);
      } else {
        setPostOpen(false);
      }
    };

    useLayoutEffect(() => {
      if (morphPhase !== "compressing") return;
      const intentcastId = morphTargetIntentcastIdRef.current;
      const fromRect = morphSourceRectRef.current;
      if (!intentcastId || !fromRect) return;
      if (postOpen) return;

      const targetEl = document.getElementById(`${domIdPrefix}-${intentcastId}`);
      if (!targetEl) {
        window.setTimeout(() => setMorphPhase("compressing"), 50);
        return;
      }
      const toRect = targetEl.getBoundingClientRect();
      setMorphRects({ from: fromRect, to: fromRect });
      setMorphPhase("expanding");
      window.requestAnimationFrame(() => {
        setMorphRects({ from: fromRect, to: toRect });
      });
    }, [domIdPrefix, intentcasts, morphPhase, postOpen]);

    useEffect(() => {
      if (morphPhase !== "expanding") return;
      const t = window.setTimeout(() => {
        setMorphPhase("idle");
        setMorphRects(null);
        setMorphPostedIntentcast(null);
        morphTargetIntentcastIdRef.current = null;
        morphSourceRectRef.current = null;
      }, 460);
      return () => window.clearTimeout(t);
    }, [morphPhase]);
    useImperativeHandle(ref, () => ({
      openCompose: () => {
        openCompose();
        panelRootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }), [openCompose]);

    const renderComposeForm = () => {
      return (
        <ComposeDialog
          open={postOpen}
          domIdPrefix={domIdPrefix}
          postSubmitting={postSubmitting}
          composeDialogRef={composeDialogRef}
          onRequestClose={() => setPostOpen(false)}
        >
        <div className="home-dashboard__bulletin-compose home-dashboard__bulletin-compose--modal">
                    <p id={`${domIdPrefix}-compose-title`} className="home-dashboard__bulletin-compose-label">New hiring post</p>
                        <div className="home-dashboard__bulletin-hiring-form">
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-company`}>
                              Company *
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-company`}
                              className="input"
                              type="text"
                              autoComplete="organization"
                              placeholder="Stripe"
                              maxLength={200}
                              value={hiringCompany}
                              onChange={(e) => setHiringCompany(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-title`}>
                              Role *
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-title`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              placeholder="Senior Product Manager, Payments Infrastructure"
                              maxLength={200}
                              value={hiringTitle}
                              onChange={(e) => setHiringTitle(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-track`}>
                              Track *
                            </label>
                            <select
                              id={`${domIdPrefix}-hiring-track`}
                              className="input"
                              value={hiringTrackChoice}
                              onChange={(e) => setHiringTrackChoice(e.target.value)}
                              disabled={postSubmitting}
                            >
                              <option value="">Select role track</option>
                              <option value="Product">Product</option>
                              <option value="Consulting">Consulting</option>
                              <option value="SDE">SDE</option>
                              <option value="Design">Design</option>
                              <option value="Data/AI">Data/AI</option>
                              <option value="Marketing">Marketing</option>
                              <option value="Sales">Sales</option>
                              <option value="Finance">Finance</option>
                              <option value="People">People</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          {hiringTrackChoice === "other" ? (
                            <div className="home-dashboard__bulletin-hiring-field">
                              <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-track-other`}>
                                Other role track details
                              </label>
                              <input
                                id={`${domIdPrefix}-hiring-track-other`}
                                className="input"
                                type="text"
                                autoComplete="off"
                                placeholder="Regulatory Affairs / Supply Chain"
                                maxLength={120}
                                value={hiringTrackOther}
                                onChange={(e) => setHiringTrackOther(e.target.value)}
                                disabled={postSubmitting}
                              />
                              <p className="home-dashboard__bulletin-hiring-details-note">
                                Posts with <strong>Other</strong> are sent to admin for verification and stay in your
                                Post tab until approved.
                              </p>
                            </div>
                          ) : null}
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-location`}>
                              Location *
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-location`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              placeholder="Bengaluru"
                              maxLength={200}
                              value={hiringLocation}
                              onChange={(e) => setHiringLocation(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-experience`}>
                              Experience (in years) *
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-experience`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              placeholder="5+"
                              maxLength={40}
                              value={hiringExperience}
                              onChange={(e) => setHiringExperience(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-comp`}>
                              Compensation (in ₹ LPA)
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-comp`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              inputMode="numeric"
                              pattern="[0-9-]*"
                              placeholder="45-60"
                              maxLength={20}
                              value={hiringCompensation}
                              onChange={(e) => setHiringCompensation(e.target.value.replace(/[^0-9-]/g, ""))}
                              disabled={postSubmitting}
                            />
                          </div>
                          {/* Employment type is temporarily hidden across the app. */}
                          <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-summary`}>
                              Role summary
                            </label>
                            <div className="home-dashboard__textarea-with-counter">
                              <textarea
                                ref={hiringSummaryTextareaRef}
                                id={`${domIdPrefix}-hiring-summary`}
                                className="input home-dashboard__respond-textarea home-dashboard__respond-textarea--with-counter"
                                rows={1}
                                placeholder="What will this person own, and what kind of impact should they expect?"
                                maxLength={700}
                                value={hiringRoleSummary}
                                onChange={(e) => setHiringRoleSummary(e.target.value)}
                                disabled={postSubmitting}
                              />
                              <span className="home-dashboard__textarea-counter" aria-live="polite">
                                {hiringRoleSummary.length} / 700
                              </span>
                            </div>
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-jd`}>
                              Job description link
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-jd`}
                              className="input"
                              type="url"
                              autoComplete="off"
                              placeholder="https://jobs.company.com/role"
                              maxLength={300}
                              value={hiringJdUrl}
                              onChange={(e) => setHiringJdUrl(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-apply`}>
                              Steps to apply
                            </label>
                            <div className="home-dashboard__textarea-with-counter">
                              <textarea
                                ref={hiringApplyTextareaRef}
                                id={`${domIdPrefix}-hiring-apply`}
                                className="input home-dashboard__respond-textarea home-dashboard__respond-textarea--with-counter"
                                rows={1}
                                placeholder="Reply here with CV + LinkedIn + 2 lines on relevant experience."
                                maxLength={700}
                                value={hiringApplySteps}
                                onChange={(e) => setHiringApplySteps(e.target.value)}
                                disabled={postSubmitting}
                              />
                              <span className="home-dashboard__textarea-counter" aria-live="polite">
                                {hiringApplySteps.length} / 700
                              </span>
                            </div>
                          </div>
                        </div>
                            <div className="home-dashboard__bulletin-hiring-preview">
                          <p className="home-dashboard__bulletin-hiring-preview-label" id={`${domIdPrefix}-hiring-live-preview`}>
                            Live preview
                          </p>
                          <div
                            className="home-dashboard__bulletin-hiring-preview-surface"
                            role="region"
                            aria-labelledby={`${domIdPrefix}-hiring-live-preview`}
                            ref={composePreviewSurfaceRef}
                          >
                            <CareerOpportunityCardBody
                              ic={hiringPreviewIntentcast(hiringPreviewAuthor, hiringPreviewBody)}
                              parsed={parseHiringBulletin(hiringPreviewBody)}
                              composePreview
                            />
                          </div>
                        </div>
                                        {postError ? <p className="home-dashboard__respond-error">{postError}</p> : null}
                    <div className="home-dashboard__respond-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setPostOpen(false);
                          resetComposeFields();
                        }}
                        disabled={postSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button type="button" variant="primary" onClick={() => void handlePostIntentcast()} disabled={postSubmitting}>
                        {postSubmitting ? (
                          <span className="home-dashboard__publish-loader">
                            <span className="home-dashboard__publish-loader-dot" aria-hidden />
                            Publishing…
                          </span>
                        ) : "Post"}
                      </Button>
                    </div>
        </div>
        </ComposeDialog>
      );
    };

    const renderFeedItem = (ic: IntentcastFeedItem) => {
      const isOwnPost = auth.status === "authenticated" && ic.authorPersonId === auth.person.personId;
      const isEditing = editIntentcastId === ic.id;
      const authorRemoved = intentcastIsAuthorRemoved(ic);
      const canEdit = isOwnPost && intentcastWithinEditWindow(ic) && !authorRemoved;
      const viewerHasReplied = ic.viewerHasResponded === true || repliedIntentcastIds.has(ic.id);
      const pendingTrackVerification =
        layout === "career" &&
        ic.category === "hiring" &&
        hiringPostNeedsTrackVerification(ic.content);
      const showReply =
        !isOwnPost &&
        intentcastIsOpen(ic) &&
        !authorRemoved &&
        !viewerHasReplied;

      const usesHiringCareerShell = layout === "career" && ic.category === "hiring";
      const listItemClass =
        isEditing || usesHiringCareerShell
          ? `home-dashboard__bulletin-card${authorRemoved && isOwnPost ? " home-dashboard__bulletin-card--author-removed" : ""}`
          : `home-dashboard__bulletin-item${authorRemoved && isOwnPost ? " home-dashboard__bulletin-card--author-removed" : ""}`;

      const splitBody = splitBulletinPostBody(ic.content);
      const cardPostedRelative = ic.createdAt ? formatRelativeTime(ic.createdAt) : null;
      const cardTone = intentcastCategoryToTone(ic.category);
      const cardBadge = intentcastCategoryBadgeLabel(ic.category);

      const standardCardFooter =
        (!isOwnPost && showReply && respondTargetId !== ic.id) || (isOwnPost && !authorRemoved) ? (
          <div className="bb-post-card__footer-row">
            {!isOwnPost && showReply && respondTargetId !== ic.id ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setRespondTargetId(ic.id);
                  setRespondMessage("");
                  setRespondError(null);
                  setEditIntentcastId(null);
                  setEditError(null);
                }}
              >
                Reply
              </button>
            ) : null}
            {isOwnPost && !authorRemoved ? (
              <div className="home-dashboard__bulletin-card-actions">
                {canEdit ? (
                  <button
                    type="button"
                    className="home-dashboard__bulletin-edit"
                    onClick={() => {
                      setEditIntentcastId(ic.id);
                      setEditContent(ic.content);
                      setEditError(null);
                      setRespondTargetId(null);
                      setBulletinDeleteError(null);
                    }}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : undefined;

      return (
        <li key={ic.id} id={`${domIdPrefix}-${ic.id}`} className={listItemClass}>
          {!isEditing && isOwnPost && !authorRemoved ? (
            <div className="bulletin-own-menu bulletin-own-menu--floated">
              <BulletinOwnPostMenu
                detachDropdown
                onRequestDelete={() => setDeleteConfirmIntentcastId(ic.id)}
                deleteDisabled={deleteSubmittingId === ic.id}
              />
            </div>
          ) : null}
          {isEditing ? (
            <>
              <textarea
                className="input home-dashboard__respond-textarea home-dashboard__bulletin-edit-textarea"
                rows={5}
                aria-label="Edit bulletin post"
                maxLength={BULLETIN_POST_MAX_LENGTH}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={editSubmitting}
              />
              <p className="home-dashboard__bulletin-char-count" aria-live="polite">
                {editContent.length} / {BULLETIN_POST_MAX_LENGTH}
              </p>
              {editError ? <p className="home-dashboard__respond-error">{editError}</p> : null}
              <div className="home-dashboard__respond-actions home-dashboard__respond-actions--wrap">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancelIntentcastEdit}
                  disabled={editSubmitting || deleteSubmittingId === ic.id}
                >
                  Cancel
                </Button>
                <button
                  type="button"
                  className="home-dashboard__bulletin-delete"
                  disabled={editSubmitting || deleteSubmittingId === ic.id}
                  onClick={() => setDeleteConfirmIntentcastId(ic.id)}
                >
                  Delete
                </button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleSaveIntentcastEdit(ic.id)}
                  disabled={editSubmitting || deleteSubmittingId === ic.id}
                >
                  {editSubmitting ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {layout === "career" && ic.category === "hiring" ? (
                <>
                  {authorRemoved && isOwnPost ? (
                    <div className="home-dashboard__bulletin-archived-banner" role="status">
                      <p className="home-dashboard__bulletin-archived-title">Removed from bulletin</p>
                      <p className="home-dashboard__bulletin-archived-copy">
                        Other alumni no longer see this post. The hiring card below is <strong>your private copy</strong> of
                        the same post-not a second public listing-so you can reread what you shared. By default we
                        permanently delete that copy <strong>{BULLETIN_AUTHOR_DELETE_RETENTION_DAYS} days</strong> after
                        removal (exact date below).
                        {ic.responseCount > 0 ? (
                          <>
                            {" "}
                            Open <strong>Show replies</strong> in this box to read responses; we don’t list them again under
                            the card.
                          </>
                        ) : null}
                      </p>
                      <AuthorPermanentDeletionNote ic={ic} />
                      <AuthorDeleteUndoRow
                        ic={ic}
                        viewerPersonId={personId}
                        undoClock={authorDeleteUndoTick}
                        restoreSubmitting={restoreSubmittingId === ic.id}
                        onRestore={() => void executeRestoreIntentcast(ic.id)}
                      />
                      {ic.responseCount > 0 ? (
                        <>
                          <button
                            type="button"
                            className="home-dashboard__bulletin-archived-replies-toggle"
                            onClick={() => void toggleArchivedReplies(ic)}
                          >
                            {archivedRepliesPostId === ic.id ? "Hide replies" : `Show replies (${ic.responseCount})`}
                          </button>
                          {archivedRepliesPostId === ic.id && archivedRepliesLoading ? (
                            <p className="home-dashboard__bulletin-archived-replies-status">Loading…</p>
                          ) : null}
                          {archivedRepliesPostId === ic.id && archivedRepliesError ? (
                            <p className="home-dashboard__respond-error">{archivedRepliesError}</p>
                          ) : null}
                          {archivedRepliesPostId === ic.id && !archivedRepliesLoading && archivedReplies.length > 0 ? (
                            <ul className="home-dashboard__bulletin-archived-replies" aria-label="Replies to your post">
                              {archivedReplies.map((r) => {
                                const replyName = intentcastReplyDisplayName(r);
                                return (
                                  <li key={r.id} className="home-dashboard__bulletin-archived-reply">
                                    <div className="home-dashboard__bulletin-archived-reply-row">
                                      <Link
                                        to={`/profiles/${r.responderPersonId}`}
                                        className="home-dashboard__bulletin-archived-reply-avatar-link"
                                        aria-label={`View ${replyName}'s profile`}
                                      >
                                        <Avatar name={replyName} size="sm" tone="pastel" />
                                      </Link>
                                      <div className="home-dashboard__bulletin-archived-reply-body">
                                        <p className="home-dashboard__bulletin-archived-reply-meta">
                                          <span className="bulletin-reply-meta__lead">
                                            <span>{r.responderFullName}</span>
                                            {r.responderIsDemo ? <DemoAuthorBadge /> : null}
                                          </span>
                                          {r.responderDepartmentCode
                                            ? ` · ${r.responderDepartmentCode.toUpperCase()}`
                                            : ""}
                                          {r.createdAt ? ` · ${formatRelativeTime(r.createdAt)}` : ""}
                                        </p>
                                        <p className="home-dashboard__bulletin-archived-reply-msg">{r.message}</p>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {pendingTrackVerification && isOwnPost ? (
                    <p className="career-opportunity-card__pending-note" role="status">
                      Role track is marked as <strong>Other</strong>. We sent this post for admin verification, so it stays
                      only in your Post tab until approved.
                    </p>
                  ) : null}
                  <CareerOpportunityCardBody
                    ic={ic}
                    parsed={parseHiringBulletin(ic.content)}
                    viewerHasReplied={viewerHasReplied}
                  />
                  {showInlineAuthorReplies && isOwnPost && ic.responseCount > 0 && !authorRemoved ? (
                    <div className="career-post-replies" aria-label="Replies to your post">
                      <button
                        type="button"
                        className="career-post-replies__toggle"
                        onClick={() => toggleInlineReplies(ic.id)}
                      >
                        {inlineRepliesPostId === ic.id ? "Hide replies" : `Show replies (${ic.responseCount})`}
                      </button>
                      {inlineRepliesPostId === ic.id && inlineRepliesError ? (
                        <p className="home-dashboard__respond-error" role="alert">
                          {inlineRepliesError}
                        </p>
                      ) : null}
                      {inlineRepliesPostId === ic.id && inlineRepliesLoading ? (
                        <p className="career-post-replies__status">Loading replies…</p>
                      ) : null}
                      {inlineRepliesPostId === ic.id && inlineReplies.length > 0 ? (
                        <>
                          <h4 className="career-post-replies__title">Replies</h4>
                          <ul className="career-post-replies__list" role="list">
                            {inlineReplies.map((r) => {
                              const replyName = intentcastReplyDisplayName(r);
                              return (
                                <li key={r.id} className="career-post-replies__item">
                                  <div className="career-post-replies__row">
                                    <Link
                                      to={`/profiles/${r.responderPersonId}`}
                                      className="career-post-replies__avatar-link"
                                      aria-label={`View ${replyName}'s profile`}
                                    >
                                      <Avatar name={replyName} size="sm" tone="pastel" />
                                    </Link>
                                    <div className="career-post-replies__body">
                                      <p className="career-post-replies__meta">
                                        <span className="bulletin-reply-meta__lead">
                                          <span>{r.responderFullName}</span>
                                          {r.responderIsDemo ? <DemoAuthorBadge /> : null}
                                        </span>
                                        {r.responderDepartmentCode ? ` · ${r.responderDepartmentCode.toUpperCase()}` : ""}
                                        {r.createdAt ? ` · ${formatRelativeTime(r.createdAt)}` : ""}
                                      </p>
                                      <p className="career-post-replies__msg">{r.message}</p>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {canEdit ? (
                    <p className="home-dashboard__bulletin-edit-hint">{formatEditWindowHint(ic.editableUntil)}</p>
                  ) : null}
                </>
              ) : (
                <>
                  {authorRemoved && isOwnPost ? (
                    <div className="home-dashboard__bulletin-archived-banner" role="status">
                      <p className="home-dashboard__bulletin-archived-title">Removed from bulletin</p>
                      <p className="home-dashboard__bulletin-archived-copy">
                        Other alumni no longer see this post. The text below is <strong>your private copy</strong> of the same
                        post-not a second listing-until we permanently delete it (by default{" "}
                        <strong>{BULLETIN_AUTHOR_DELETE_RETENTION_DAYS} days</strong> after removal; the exact date is below).
                        {ic.responseCount > 0 ? (
                          <>
                            {" "}
                            Open <strong>Show replies</strong> in this box to read responses.
                          </>
                        ) : null}
                      </p>
                      <AuthorPermanentDeletionNote ic={ic} />
                      <AuthorDeleteUndoRow
                        ic={ic}
                        viewerPersonId={personId}
                        undoClock={authorDeleteUndoTick}
                        restoreSubmitting={restoreSubmittingId === ic.id}
                        onRestore={() => void executeRestoreIntentcast(ic.id)}
                      />
                      {ic.responseCount > 0 ? (
                        <>
                          <button
                            type="button"
                            className="home-dashboard__bulletin-archived-replies-toggle"
                            onClick={() => void toggleArchivedReplies(ic)}
                          >
                            {archivedRepliesPostId === ic.id ? "Hide replies" : `Show replies (${ic.responseCount})`}
                          </button>
                          {archivedRepliesPostId === ic.id && archivedRepliesLoading ? (
                            <p className="home-dashboard__bulletin-archived-replies-status">Loading…</p>
                          ) : null}
                          {archivedRepliesPostId === ic.id && archivedRepliesError ? (
                            <p className="home-dashboard__respond-error">{archivedRepliesError}</p>
                          ) : null}
                          {archivedRepliesPostId === ic.id && !archivedRepliesLoading && archivedReplies.length > 0 ? (
                            <ul className="home-dashboard__bulletin-archived-replies" aria-label="Replies to your post">
                              {archivedReplies.map((r) => {
                                const replyName = intentcastReplyDisplayName(r);
                                return (
                                  <li key={r.id} className="home-dashboard__bulletin-archived-reply">
                                    <div className="home-dashboard__bulletin-archived-reply-row">
                                      <Link
                                        to={`/profiles/${r.responderPersonId}`}
                                        className="home-dashboard__bulletin-archived-reply-avatar-link"
                                        aria-label={`View ${replyName}'s profile`}
                                      >
                                        <Avatar name={replyName} size="sm" tone="pastel" />
                                      </Link>
                                      <div className="home-dashboard__bulletin-archived-reply-body">
                                        <p className="home-dashboard__bulletin-archived-reply-meta">
                                          <span className="bulletin-reply-meta__lead">
                                            <span>{r.responderFullName}</span>
                                            {r.responderIsDemo ? <DemoAuthorBadge /> : null}
                                          </span>
                                          {r.responderDepartmentCode
                                            ? ` · ${r.responderDepartmentCode.toUpperCase()}`
                                            : ""}
                                          {r.createdAt ? ` · ${formatRelativeTime(r.createdAt)}` : ""}
                                        </p>
                                        <p className="home-dashboard__bulletin-archived-reply-msg">{r.message}</p>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <BulletinPostCard
                    variant="stack"
                    personProfileHref={`/profiles/${ic.authorPersonId}`}
                    authorFullName={ic.authorFullName}
                    departmentCode={ic.authorDepartmentCode}
                    batchYear={ic.authorBatchYear ?? null}
                    postedRelative={cardPostedRelative}
                    postedAtIso={ic.createdAt ?? null}
                    authorIsDemo={Boolean(ic.authorIsDemo)}
                    tone={cardTone}
                    categoryBadgeLabel={cardBadge}
                    title={splitBody.title.trim() ? splitBody.title : ic.content.trim()}
                    summary={splitBody.summary}
                    footer={standardCardFooter}
                  />
                  {canEdit ? (
                    <p className="home-dashboard__bulletin-edit-hint">{formatEditWindowHint(ic.editableUntil)}</p>
                  ) : null}
                </>
              )}
            </>
          )}
          {isOwnPost && !isEditing && !authorRemoved && usesHiringCareerShell && canEdit ? (
            <div className="home-dashboard__bulletin-card-actions">
              <button
                type="button"
                className="home-dashboard__bulletin-edit"
                onClick={() => {
                  setEditIntentcastId(ic.id);
                  setEditContent(ic.content);
                  setEditError(null);
                  setRespondTargetId(null);
                  setBulletinDeleteError(null);
                }}
              >
                Edit
              </button>
            </div>
          ) : null}
          {!isOwnPost && showReply && respondTargetId === ic.id ? (
            <div className="home-dashboard__respond-box">
              <textarea
                className="input home-dashboard__respond-textarea"
                rows={3}
                placeholder="Write at least 5 characters…"
                maxLength={BULLETIN_REPLY_MAX_LENGTH}
                value={respondMessage}
                onChange={(e) => setRespondMessage(e.target.value)}
                disabled={respondSubmitting}
              />
              <p className="home-dashboard__bulletin-char-count" aria-live="polite">
                {respondMessage.length} / {BULLETIN_REPLY_MAX_LENGTH}
              </p>
              {respondError ? <p className="home-dashboard__respond-error">{respondError}</p> : null}
              <div className="home-dashboard__respond-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRespondTargetId(null);
                    setRespondMessage("");
                    setRespondError(null);
                  }}
                  disabled={respondSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleRespond(ic.id)}
                  disabled={respondSubmitting}
                >
                  {respondSubmitting ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          ) : null}
          {!isOwnPost && showReply && respondTargetId !== ic.id && usesHiringCareerShell ? (
            <button
              type="button"
              className="home-dashboard__bulletin-reply"
              onClick={() => {
                setRespondTargetId(ic.id);
                setRespondMessage("");
                setRespondError(null);
                setEditIntentcastId(null);
                setEditError(null);
              }}
            >
              Reply
            </button>
          ) : null}
          {!isOwnPost &&
          viewerHasReplied &&
          !(layout === "career" && ic.category === "hiring") ? (
            <p className="home-dashboard__bulletin-replied-note">You replied.</p>
          ) : null}
        </li>
      );
    };

    const headingId = showPanelHeader ? "home-bulletin-heading" : undefined;
    return (
            <section
              ref={panelRootRef}
              className={`home-dashboard__bulletin${layout === "career" ? " home-dashboard__bulletin--career" : ""}${className ? ` ${className}` : ""}`}
              aria-labelledby={headingId}
            >
              <div
                className={`home-dashboard__bulletin-panel${composeDialogOpen || deleteDialogOpen ? " home-dashboard__bulletin-panel--dialog-open" : ""}`}
              >
                {showPanelHeader ? (
                  <header className="home-dashboard__bulletin-header">
                    <h2 id="home-bulletin-heading" className="home-dashboard__bulletin-title">
                      {title}
                    </h2>
                    <p className="home-dashboard__bulletin-caption">{caption}</p>
                  </header>
                ) : null}
                {bulletinDeleteError ? (
                  <p className="home-dashboard__bulletin-inline-error" role="alert">
                    {bulletinDeleteError}
                  </p>
                ) : null}
                {bulletinRestoreError ? (
                  <p className="home-dashboard__bulletin-inline-error" role="alert">
                    {bulletinRestoreError}
                  </p>
                ) : null}
                <FeedList
                  showFeed={showFeed}
                  status={bulletinFeedStatus}
                  errorMessage={bulletinFeedError}
                  emptyMessage={
                    feedMine && feedAuthorHistory && lockedCategoryFilter === "hiring"
                      ? "You haven’t posted a hiring role yet. Use Compose hiring post above to add one."
                      : lockedCategoryFilter === "hiring"
                        ? "No hiring posts right now."
                        : "No posts yet. Check back soon."
                  }
                  onRetry={() => setBulletinFeedRetryNonce((n) => n + 1)}
                >
                  {intentcasts.length > 0 ? (
                    <div
                      ref={bulletinScrollRef}
                      className={`home-dashboard__bulletin-scroll${feedDisableAutoScroll ? "" : " home-dashboard__bulletin-scroll--auto"}`}
                      aria-label="Active requests"
                      onPointerEnter={() => {
                        bulletinAutoScrollPauseRef.current.pointerInside = true;
                      }}
                      onPointerLeave={(e) => {
                        const next = e.relatedTarget as Node | null;
                        if (!next || !e.currentTarget.contains(next)) {
                          bulletinAutoScrollPauseRef.current.pointerInside = false;
                        }
                      }}
                      onFocusCapture={() => {
                        bulletinAutoScrollPauseRef.current.focusInside = true;
                      }}
                      onBlurCapture={(e) => {
                        const next = e.relatedTarget as Node | null;
                        if (!next || !e.currentTarget.contains(next)) {
                          bulletinAutoScrollPauseRef.current.focusInside = false;
                        }
                      }}
                      onWheel={() => {
                        bulletinAutoScrollPauseRef.current.wheelUntil = Date.now() + BULLETIN_AUTO_SCROLL_WHEEL_PAUSE_MS;
                      }}
                    >
                    <ul className="home-dashboard__bulletin-list" role="list">
                      {intentcasts.map(renderFeedItem)}
                    </ul>
                    {intentcastNextOffset != null ? (
                      <div ref={bulletinSentinelRef} className="home-dashboard__bulletin-sentinel" aria-hidden />
                    ) : null}
                    {intentcastsLoadingMore ? (
                      <p className="home-dashboard__bulletin-loading-more">Loading more…</p>
                    ) : null}
                    {intentcastsLoadMoreError ? (
                      <div className="home-dashboard__bulletin-load-more-error">
                        <p>{intentcastsLoadMoreError}</p>
                        <button type="button" onClick={() => void loadMoreIntentcasts()}>
                          Try again
                        </button>
                      </div>
                    ) : null}
                    </div>
                  ) : null}
                </FeedList>
                {!postOpen && !hideComposeCta ? (
                  <button
                    type="button"
                    className="home-dashboard__bulletin-cta"
                    onClick={() => {
                      openCompose();
                    }}
                  >
                    <span className="home-dashboard__bulletin-cta-icon" aria-hidden>
                      +
                    </span>
                    Compose
                  </button>
                ) : null}
              </div>
              {renderComposeForm()}
              <BulletinDeleteIntentcastDialog
                open={Boolean(deleteConfirmIntentcastId)}
                deleteDialogRef={deleteDialogRef}
                submitting={deleteSubmittingId === deleteConfirmIntentcastId}
                onRequestClose={() => setDeleteConfirmIntentcastId(null)}
                onConfirm={() => {
                  if (!deleteConfirmIntentcastId) return;
                  void executeDeleteIntentcast(deleteConfirmIntentcastId);
                }}
              />
              {morphPostedIntentcast && morphRects ? (
                <div
                  aria-hidden
                  className={`home-dashboard__publish-morph home-dashboard__publish-morph--${morphPhase}`}
                  style={{
                    left: morphRects.from.left,
                    top: morphRects.from.top,
                    width: morphRects.from.width,
                    height: morphRects.from.height,
                    transform:
                      morphPhase === "compressing"
                        ? "translate3d(0,0,0) scale(0.94)"
                        : morphPhase === "expanding"
                          ? `translate3d(${morphRects.to.left - morphRects.from.left}px, ${morphRects.to.top - morphRects.from.top}px, 0) scale(1)`
                          : "translate3d(0,0,0) scale(1)",
                  }}
                >
                  <CareerOpportunityCardBody
                    ic={morphPostedIntentcast}
                    parsed={parseHiringBulletin(morphPostedIntentcast.content)}
                  />
                </div>
              ) : null}
            </section>
    );
  }
);

BulletinPanel.displayName = "BulletinPanel";
