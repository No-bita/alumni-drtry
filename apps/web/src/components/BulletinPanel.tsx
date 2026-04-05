import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
  buildHiringBulletinContent,
  parseHiringBulletin,
  postedByShortLabel,
  validateHiringBulletinFields,
  type ParsedHiringBulletin,
} from "../lib/parseHiringBulletin";

function hiringPreviewIntentcast(authorFullName: string, content: string): IntentcastFeedItem {
  const now = new Date().toISOString();
  return {
    id: "__preview__",
    authorPersonId: "",
    authorFullName,
    authorDepartmentCode: null,
    authorDepartmentName: null,
    authorBatchYear: null,
    category: "hiring",
    content,
    status: "open",
    expiresAt: now,
    closedAt: null,
    createdAt: now,
    editableUntil: now,
    responseCount: 0,
    viewerHasResponded: false,
  };
}

const BULLETIN_PAGE_SIZE = 15;

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

function formatRelativeTime(iso: string): string {
  const t = Date.now() - new Date(iso).getTime();
  const s = Math.floor(t / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function firstNameFromFullName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

/** Cohort label e.g. 2024 → '24 */
function formatBatchYearShort(year: number): string {
  const y = Math.floor(year) % 100;
  return `'${String(y).padStart(2, "0")}`;
}

/** Short byline: First name, DEPT 'YY · time */
function formatBulletinAuthorByline(ic: IntentcastFeedItem): string {
  const first = firstNameFromFullName(ic.authorFullName);
  const dept = ic.authorDepartmentCode?.trim().toUpperCase() ?? "";
  const batch =
    ic.authorBatchYear != null && Number.isFinite(ic.authorBatchYear)
      ? formatBatchYearShort(ic.authorBatchYear)
      : "";

  let core = first || "Alum";
  if (dept && batch) {
    core = `${first}, ${dept} ${batch}`;
  } else if (dept) {
    core = `${first}, ${dept}`;
  } else if (batch) {
    core = `${first} ${batch}`;
  }

  if (ic.createdAt) {
    return `${core} · ${formatRelativeTime(ic.createdAt)}`;
  }
  return core;
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
  void undoClock;
  if (!viewerPersonId || ic.authorPersonId !== viewerPersonId) return null;
  const removed = ic.authorSoftDeletedAt;
  if (!removed || Number.isNaN(Date.parse(removed))) return null;
  if (Date.now() >= intentcastAuthorDeleteUndoDeadlineMs(removed)) return null;
  const msLeft = intentcastAuthorDeleteUndoDeadlineMs(removed) - Date.now();
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

/** One-line context for delete confirmation (hiring shape or raw body). */
function intentcastDeleteSummaryText(ic: IntentcastFeedItem): string {
  const parsed = parseHiringBulletin(ic.content);
  if (parsed) {
    return `${parsed.company} — ${parsed.title}`;
  }
  const t = ic.content.trim().replace(/\s+/g, " ");
  if (!t) return "This post";
  return t.length > 88 ? `${t.slice(0, 88)}…` : t;
}

function CareerOpportunityCardBody({
  ic,
  parsed,
  composePreview = false,
}: {
  ic: IntentcastFeedItem;
  parsed: ParsedHiringBulletin | null;
  /** Omits poster row and timestamp so the compose form preview reads as draft layout, not a duplicate feed card. */
  composePreview?: boolean;
}) {
  const cardClass = `career-opportunity-card${composePreview ? " career-opportunity-card--compose-preview" : ""}`;

  if (!parsed) {
    return (
      <div className={cardClass}>
        <div className="career-opportunity-card__header">
          <div className="career-opportunity-card__brand">
            <span className="career-opportunity-card__company">Hiring</span>
          </div>
          {!composePreview ? (
            <div className="career-opportunity-card__poster">
              <Avatar name={ic.authorFullName} size="sm" tone="pastel" className="career-opportunity-card__avatar" />
              <span className="career-opportunity-card__posted-by">
                Posted by {postedByShortLabel(ic.authorFullName)}
              </span>
            </div>
          ) : null}
        </div>
        <h3 className="career-opportunity-card__title career-opportunity-card__title--unparsed">{ic.content.trim()}</h3>
        {!composePreview && ic.createdAt ? (
          <div className="career-opportunity-card__footer">
            <time className="career-opportunity-card__time" dateTime={ic.createdAt}>
              {formatRelativeTime(ic.createdAt)}
            </time>
          </div>
        ) : null}
      </div>
    );
  }

  const hasDescription = Boolean(parsed.description.trim());

  return (
    <div className={cardClass}>
      <div className="career-opportunity-card__header">
        <div className="career-opportunity-card__brand">
          <span className="career-opportunity-card__company">{parsed.company.toUpperCase()}</span>
          {parsed.locationLine ? (
            <>
              <span className="career-opportunity-card__brand-dot" aria-hidden>
                ·
              </span>
              <span className="career-opportunity-card__location">{parsed.locationLine}</span>
            </>
          ) : null}
        </div>
        {!composePreview ? (
          <div className="career-opportunity-card__poster">
            <Avatar name={ic.authorFullName} size="sm" tone="pastel" className="career-opportunity-card__avatar" />
            <span className="career-opportunity-card__posted-by">
              Posted by {postedByShortLabel(ic.authorFullName)}
            </span>
          </div>
        ) : null}
      </div>
      <h3 className="career-opportunity-card__title">{parsed.title}</h3>
      {hasDescription ? <p className="career-opportunity-card__description">{parsed.description}</p> : null}
      {!composePreview && ic.createdAt ? (
        <div className="career-opportunity-card__footer">
          <time className="career-opportunity-card__time" dateTime={ic.createdAt}>
            {formatRelativeTime(ic.createdAt)}
          </time>
        </div>
      ) : null}
    </div>
  );
}

export const BulletinPanel = forwardRef<BulletinPanelHandle, BulletinPanelProps>(
  function BulletinPanel(
    {
      feedReady,
      domIdPrefix = "home-bulletin",
      title = "Bulletin",
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
      composePlacement = "panelEnd",
      onComposeOpenChange,
    },
    ref
  ) {
    const auth = useAuth();
    const location = useLocation();
    const authPersonId = auth.status === "authenticated" ? auth.person.personId : undefined;
    const personId = authPersonId;
    const panelRootRef = useRef<HTMLElement | null>(null);

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
      (offset: number) => {
        const q = new URLSearchParams({
          limit: String(BULLETIN_PAGE_SIZE),
          offset: String(offset),
        });
        if (effectiveCategoryFilter) q.set("category", effectiveCategoryFilter);
        if (feedMine) q.set("mine", "true");
        if (feedAuthorHistory) q.set("authorHistory", "true");
        if (feedExcludeAuthorSoftDeleted) q.set("excludeAuthorSoftDeleted", "true");
        return q;
      },
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
      if (!showFeed) return [];
      let list = [...feedFlat];
      const hi = highlightQuery.data?.intentcast;
      if (
        hi &&
        !list.some((ic) => ic.id === hi.id) &&
        !(feedMine && feedAuthorHistory && personId && hi.authorPersonId !== personId) &&
        !(feedExcludeAuthorSoftDeleted && hi.authorSoftDeletedAt)
      ) {
        list = [hi, ...list];
      }
      return list;
    }, [
      showFeed,
      feedFlat,
      highlightQuery.data,
      feedMine,
      feedAuthorHistory,
      feedExcludeAuthorSoftDeleted,
      personId,
    ]);

    const bulletinFeedStatus: "loading" | "ready" | "error" = !showFeed
      ? "ready"
      : !feedEnabled
        ? "loading"
        : feedInfinite.isPending && !feedInfinite.data
          ? "loading"
          : feedInfinite.isError
            ? "error"
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
        queryClient.setQueryData<InfiniteData<IntentcastFeedResponse>>(feedQueryKey, (old) => {
          if (!old) return old;
          return {
            pageParams: old.pageParams,
            pages: old.pages.map((page) => ({
              ...page,
              intentcasts: page.intentcasts.map((ic) => (ic.id === intentcastId ? map(ic) : ic)),
            })),
          };
        });
      },
      [queryClient, feedQueryKey]
    );

    const prependFeedIntentcast = useCallback(
      (posted: IntentcastFeedItem) => {
        queryClient.setQueryData<InfiniteData<IntentcastFeedResponse>>(feedQueryKey, (old) => {
          if (!old?.pages[0]) return old;
          const [first, ...rest] = old.pages;
          return {
            ...old,
            pages: [
              {
                ...first,
                intentcasts: [posted, ...first.intentcasts.filter((x) => x.id !== posted.id)],
              },
              ...rest,
            ],
          };
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
    const [postOpen, setPostOpen] = useState(false);
    const [hiringCompany, setHiringCompany] = useState("");
    const [hiringTitle, setHiringTitle] = useState("");
    const [hiringLocation, setHiringLocation] = useState("");
    const [hiringDetails, setHiringDetails] = useState("");
    const [postSubmitting, setPostSubmitting] = useState(false);
    const [postError, setPostError] = useState<string | null>(null);
    const [deleteSubmittingId, setDeleteSubmittingId] = useState<string | null>(null);
    const [deleteConfirmIntentcastId, setDeleteConfirmIntentcastId] = useState<string | null>(null);
    const [bulletinDeleteError, setBulletinDeleteError] = useState<string | null>(null);
    const [restoreSubmittingId, setRestoreSubmittingId] = useState<string | null>(null);
    const [bulletinRestoreError, setBulletinRestoreError] = useState<string | null>(null);
    const [authorDeleteUndoTick, setAuthorDeleteUndoTick] = useState(0);
    const [archivedRepliesPostId, setArchivedRepliesPostId] = useState<string | null>(null);

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

    const careerReplyTargets = useMemo(
      () =>
        showInlineAuthorReplies && personId
          ? intentcasts.filter(
              (ic) =>
                ic.authorPersonId === personId &&
                ic.responseCount > 0 &&
                !intentcastIsAuthorRemoved(ic)
            )
          : [],
      [showInlineAuthorReplies, personId, intentcasts]
    );

    const careerReplyQueries = useQueries({
      queries: careerReplyTargets.map((ic) => ({
        queryKey: queryKeys.intentcasts.responses(ic.id),
        queryFn: ({ signal }) =>
          assertApiGet<{ responses: IntentcastResponseItem[] }>(
            `/v1/intentcasts/${ic.id}/responses`,
            signal
          ),
        enabled: showInlineAuthorReplies && careerReplyTargets.length > 0,
      })),
    });

    const careerInlineReplies = useMemo(() => {
      const out: Record<string, IntentcastResponseItem[]> = {};
      careerReplyTargets.forEach((ic, i) => {
        const q = careerReplyQueries[i];
        if (q?.data?.responses) out[ic.id] = q.data.responses;
      });
      return out;
    }, [careerReplyTargets, careerReplyQueries]);

    const careerInlineRepliesError = useMemo(() => {
      for (const q of careerReplyQueries) {
        if (q.isError) {
          return q.error instanceof Error ? q.error.message : String(q.error);
        }
      }
      return null;
    }, [careerReplyQueries]);

    useEffect(() => {
      onComposeOpenChange?.(postOpen);
    }, [postOpen, onComposeOpenChange]);

    const deleteConfirmIntentcast = useMemo(
      () =>
        deleteConfirmIntentcastId
          ? (intentcasts.find((ic) => ic.id === deleteConfirmIntentcastId) ?? null)
          : null,
      [intentcasts, deleteConfirmIntentcastId]
    );

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
      if (!deleteConfirmIntentcastId) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setDeleteConfirmIntentcastId(null);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [deleteConfirmIntentcastId]);

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
      if (error || !data?.intentcast) {
        setBulletinDeleteError(error?.message ?? error?.code ?? "Could not remove post.");
        return;
      }
      const updated = data.intentcast;
      patchFeedItem(intentcastId, () => updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(intentcastId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.responses(intentcastId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
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

    const toggleArchivedReplies = (ic: IntentcastFeedItem) => {
      if (archivedRepliesPostId === ic.id) {
        setArchivedRepliesPostId(null);
        return;
      }
      setArchivedRepliesPostId(ic.id);
    };

    const hiringComposeBody = useMemo(
      () =>
        buildHiringBulletinContent({
          company: hiringCompany,
          title: hiringTitle,
          location: hiringLocation,
          details: hiringDetails,
        }).trim(),
      [hiringCompany, hiringTitle, hiringLocation, hiringDetails]
    );

    const hiringPreviewAuthor =
      auth.status === "authenticated"
        ? (auth.myProfile?.fullName?.trim() || "You")
        : "You";

    const handlePostIntentcast = async () => {
      const categoryForApi: BulletinCategory = lockedCategoryFilter ?? "hiring";
      const fieldErr = validateHiringBulletinFields({
        company: hiringCompany,
        title: hiringTitle,
        location: hiringLocation,
        details: hiringDetails,
      });
      if (fieldErr) {
        setPostError(fieldErr);
        return;
      }
      const content = hiringComposeBody;

      if (content.length < 10) {
        setPostError("Post must be at least 10 characters.");
        return;
      }
      if (content.length > BULLETIN_POST_MAX_LENGTH) {
        setPostError(`Post must be at most ${BULLETIN_POST_MAX_LENGTH} characters.`);
        return;
      }
      setPostError(null);
      setPostSubmitting(true);
      const { data, error } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: categoryForApi,
        content,
      });
      setPostSubmitting(false);
      const posted = data?.intentcast;
      if (error || !posted) {
        setPostError(error?.message ?? error?.code ?? "Could not post bulletin.");
        return;
      }
      const matchesFilter =
        effectiveCategoryFilter == null || posted.category === effectiveCategoryFilter;
      if (matchesFilter) {
        prependFeedIntentcast(posted);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(posted.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      setHiringCompany("");
      setHiringTitle("");
      setHiringLocation("");
      setHiringDetails("");
      setPostOpen(false);
    };
    useImperativeHandle(ref, () => ({
      openCompose: () => {
        setPostOpen(true);
        setPostError(null);
        setHiringCompany("");
        setHiringTitle("");
        setHiringLocation("");
        setHiringDetails("");
        panelRootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }));

    const renderComposeForm = () => {
      if (!postOpen) return null;
      return (
        <div
          className={
            "home-dashboard__bulletin-compose" +
            (composePlacement === "panelStart" ? " home-dashboard__bulletin-compose--panel-start" : "")
          }
        >
                    <p className="home-dashboard__bulletin-compose-label">New hiring post</p>
                    <p className="home-dashboard__bulletin-compose-hint">
                      Each line below has one job: <strong>company</strong>, <strong>role title</strong>, and{" "}
                      <strong>where</strong> people work from. Put everything else in <strong>Role details</strong>—type of
                      engagement, seniority, pay, must-have skills, and how to apply—so nothing repeats between fields. Card
                      matches <strong>Opportunities</strong>. {BULLETIN_POST_MAX_LENGTH.toLocaleString()} characters max.
                    </p>
                        <div className="home-dashboard__bulletin-hiring-form">
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-company`}>
                              Company / team
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-company`}
                              className="input"
                              type="text"
                              autoComplete="organization"
                              placeholder="e.g. Acme Labs"
                              maxLength={200}
                              value={hiringCompany}
                              onChange={(e) => setHiringCompany(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-title`}>
                              Role title
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-title`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              placeholder="e.g. Senior Product Designer"
                              maxLength={200}
                              value={hiringTitle}
                              onChange={(e) => setHiringTitle(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-location`}>
                              Location
                            </label>
                            <input
                              id={`${domIdPrefix}-hiring-location`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              placeholder="e.g. Bengaluru, Remote friendly"
                              maxLength={200}
                              value={hiringLocation}
                              onChange={(e) => setHiringLocation(e.target.value)}
                              disabled={postSubmitting}
                            />
                          </div>
                          <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                            <label className="ui-label" htmlFor={`${domIdPrefix}-hiring-details`}>
                              Role details
                            </label>
                            <textarea
                              id={`${domIdPrefix}-hiring-details`}
                              className="input home-dashboard__respond-textarea home-dashboard__bulletin-hiring-details"
                              rows={4}
                              placeholder="e.g. Full-time · Seniority (e.g. 5+ yrs or mid-level) · Pay band or competitive · Must-have skills or credentials · How to apply (link, email, or reply here)"
                              maxLength={BULLETIN_POST_MAX_LENGTH}
                              value={hiringDetails}
                              onChange={(e) => setHiringDetails(e.target.value)}
                              disabled={postSubmitting}
                            />
                            <p className="home-dashboard__bulletin-hiring-details-note">
                              Avoid extra parentheses in the title line so the card layout parses cleanly.
                            </p>
                          </div>
                        </div>
                        {hiringComposeBody.length >= 10 ? (
                          <div className="home-dashboard__bulletin-hiring-preview">
                            <p className="home-dashboard__bulletin-hiring-preview-label" id={`${domIdPrefix}-hiring-live-preview`}>
                              Live preview
                            </p>
                            <div
                              className="home-dashboard__bulletin-hiring-preview-surface"
                              role="region"
                              aria-labelledby={`${domIdPrefix}-hiring-live-preview`}
                            >
                              <CareerOpportunityCardBody
                                ic={hiringPreviewIntentcast(hiringPreviewAuthor, hiringComposeBody)}
                                parsed={parseHiringBulletin(hiringComposeBody)}
                                composePreview
                              />
                            </div>
                          </div>
                        ) : null}
                    <p className="home-dashboard__bulletin-char-count" aria-live="polite">
                      {hiringComposeBody.length} / {BULLETIN_POST_MAX_LENGTH}
                    </p>
                    {postError ? <p className="home-dashboard__respond-error">{postError}</p> : null}
                    <div className="home-dashboard__respond-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setPostOpen(false);
                          setPostError(null);
                          setHiringCompany("");
                          setHiringTitle("");
                          setHiringLocation("");
                          setHiringDetails("");
                        }}
                        disabled={postSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button type="button" variant="primary" onClick={() => void handlePostIntentcast()} disabled={postSubmitting}>
                        {postSubmitting ? "Posting…" : "Post"}
                      </Button>
                    </div>
        </div>
      );
    };

    const headingId = showPanelHeader ? "home-bulletin-heading" : undefined;
    return (
            <section
              ref={panelRootRef}
              className={`home-dashboard__bulletin${layout === "career" ? " home-dashboard__bulletin--career" : ""}${className ? ` ${className}` : ""}`}
              aria-labelledby={headingId}
            >
              <div className="home-dashboard__bulletin-panel">
                {composePlacement === "panelStart" ? renderComposeForm() : null}
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
                {showFeed ? (
                  bulletinFeedStatus === "loading" ? (
                    <p className="home-dashboard__bulletin-empty">Loading posts…</p>
                  ) : bulletinFeedStatus === "error" ? (
                    <div className="home-dashboard__bulletin-load-more-error">
                      <p>{bulletinFeedError ?? "Could not load bulletin."}</p>
                      <button type="button" onClick={() => setBulletinFeedRetryNonce((n) => n + 1)}>
                        Retry
                      </button>
                    </div>
                  ) : intentcasts.length === 0 ? (
                    <p className="home-dashboard__bulletin-empty">
                      {feedMine && feedAuthorHistory && lockedCategoryFilter === "hiring"
                        ? "You haven’t posted a hiring role yet. Use Compose hiring post above to add one."
                        : lockedCategoryFilter === "hiring"
                          ? "No hiring posts right now."
                          : "No posts yet. Check back soon."}
                    </p>
                  ) : (
                    <div
                    ref={bulletinScrollRef}
                    className={`home-dashboard__bulletin-scroll${feedDisableAutoScroll ? "" : " home-dashboard__bulletin-scroll--auto"}`}
                    aria-label="Bulletin posts"
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
                      {intentcasts.map((ic) => {
                        const isOwnPost =
                          auth.status === "authenticated" && ic.authorPersonId === auth.person.personId;
                        const isEditing = editIntentcastId === ic.id;
                        const authorRemoved = intentcastIsAuthorRemoved(ic);
                        const canEdit =
                          isOwnPost && intentcastWithinEditWindow(ic) && !authorRemoved;
                        const viewerHasReplied =
                          ic.viewerHasResponded === true || repliedIntentcastIds.has(ic.id);
                        const showReply =
                          !isOwnPost &&
                          intentcastIsOpen(ic) &&
                          !authorRemoved &&
                          !viewerHasReplied;
                        return (
                          <li
                            key={ic.id}
                            id={`${domIdPrefix}-${ic.id}`}
                            className={`home-dashboard__bulletin-card${authorRemoved && isOwnPost ? " home-dashboard__bulletin-card--author-removed" : ""}`}
                          >
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
                                          Other alumni no longer see this post. The hiring card below is{" "}
                                          <strong>your private copy</strong> of the same post—not a second public listing—so you
                                          can reread what you shared. By default we permanently delete that copy{" "}
                                          <strong>{BULLETIN_AUTHOR_DELETE_RETENTION_DAYS} days</strong> after removal (exact date
                                          below).
                                          {ic.responseCount > 0 ? (
                                            <>
                                              {" "}
                                              Open <strong>Show replies</strong> in this box to read responses; we don’t list
                                              them again under the card.
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
                                              {archivedRepliesPostId === ic.id
                                                ? "Hide replies"
                                                : `Show replies (${ic.responseCount})`}
                                            </button>
                                            {archivedRepliesPostId === ic.id && archivedRepliesLoading ? (
                                              <p className="home-dashboard__bulletin-archived-replies-status">
                                                Loading…
                                              </p>
                                            ) : null}
                                            {archivedRepliesPostId === ic.id && archivedRepliesError ? (
                                              <p className="home-dashboard__respond-error">{archivedRepliesError}</p>
                                            ) : null}
                                            {archivedRepliesPostId === ic.id &&
                                            !archivedRepliesLoading &&
                                            archivedReplies.length > 0 ? (
                                              <ul
                                                className="home-dashboard__bulletin-archived-replies"
                                                aria-label="Replies to your post"
                                              >
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
                                                            {r.responderFullName}
                                                            {r.responderDepartmentCode
                                                              ? ` · ${r.responderDepartmentCode.toUpperCase()}`
                                                              : ""}
                                                            {r.createdAt
                                                              ? ` · ${formatRelativeTime(r.createdAt)}`
                                                              : ""}
                                                          </p>
                                                          <p className="home-dashboard__bulletin-archived-reply-msg">
                                                            {r.message}
                                                          </p>
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
                                    <CareerOpportunityCardBody ic={ic} parsed={parseHiringBulletin(ic.content)} />
                                    {showInlineAuthorReplies && isOwnPost && ic.responseCount > 0 && !authorRemoved ? (
                                      <div className="career-post-replies" aria-label="Replies to your post">
                                        {careerInlineRepliesError ? (
                                          <p className="home-dashboard__respond-error" role="alert">
                                            {careerInlineRepliesError}
                                          </p>
                                        ) : null}
                                        {!careerInlineReplies[ic.id] && !careerInlineRepliesError ? (
                                          <p className="career-post-replies__status">Loading replies…</p>
                                        ) : null}
                                        {careerInlineReplies[ic.id] && careerInlineReplies[ic.id].length > 0 ? (
                                          <>
                                            <h4 className="career-post-replies__title">Replies</h4>
                                            <ul className="career-post-replies__list" role="list">
                                              {careerInlineReplies[ic.id].map((r) => {
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
                                                          {r.responderFullName}
                                                          {r.responderDepartmentCode
                                                            ? ` · ${r.responderDepartmentCode.toUpperCase()}`
                                                            : ""}
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
                                      <p className="home-dashboard__bulletin-edit-hint">
                                        {formatEditWindowHint(ic.editableUntil)}
                                      </p>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    {authorRemoved && isOwnPost ? (
                                      <div className="home-dashboard__bulletin-archived-banner" role="status">
                                        <p className="home-dashboard__bulletin-archived-title">Removed from bulletin</p>
                                        <p className="home-dashboard__bulletin-archived-copy">
                                          Other alumni no longer see this post. The text below is{" "}
                                          <strong>your private copy</strong> of the same post—not a second listing—until we
                                          permanently delete it (by default <strong>{BULLETIN_AUTHOR_DELETE_RETENTION_DAYS} days</strong>{" "}
                                          after removal; the exact date is below).
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
                                              {archivedRepliesPostId === ic.id
                                                ? "Hide replies"
                                                : `Show replies (${ic.responseCount})`}
                                            </button>
                                            {archivedRepliesPostId === ic.id && archivedRepliesLoading ? (
                                              <p className="home-dashboard__bulletin-archived-replies-status">
                                                Loading…
                                              </p>
                                            ) : null}
                                            {archivedRepliesPostId === ic.id && archivedRepliesError ? (
                                              <p className="home-dashboard__respond-error">{archivedRepliesError}</p>
                                            ) : null}
                                            {archivedRepliesPostId === ic.id &&
                                            !archivedRepliesLoading &&
                                            archivedReplies.length > 0 ? (
                                              <ul
                                                className="home-dashboard__bulletin-archived-replies"
                                                aria-label="Replies to your post"
                                              >
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
                                                            {r.responderFullName}
                                                            {r.responderDepartmentCode
                                                              ? ` · ${r.responderDepartmentCode.toUpperCase()}`
                                                              : ""}
                                                            {r.createdAt
                                                              ? ` · ${formatRelativeTime(r.createdAt)}`
                                                              : ""}
                                                          </p>
                                                          <p className="home-dashboard__bulletin-archived-reply-msg">
                                                            {r.message}
                                                          </p>
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
                                    <p className="home-dashboard__bulletin-body">{ic.content}</p>
                                    <p className="home-dashboard__bulletin-meta">{formatBulletinAuthorByline(ic)}</p>
                                    {canEdit ? (
                                      <p className="home-dashboard__bulletin-edit-hint">
                                        {formatEditWindowHint(ic.editableUntil)}
                                      </p>
                                    ) : null}
                                  </>
                                )}
                              </>
                            )}
                            {isOwnPost && !isEditing && !authorRemoved ? (
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
                                <button
                                  type="button"
                                  className="home-dashboard__bulletin-delete"
                                  disabled={deleteSubmittingId === ic.id}
                                  onClick={() => setDeleteConfirmIntentcastId(ic.id)}
                                >
                                  Delete
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
                            {!isOwnPost && showReply && respondTargetId !== ic.id ? (
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
                            {!isOwnPost && viewerHasReplied ? (
                              <p className="home-dashboard__bulletin-replied-note">You replied.</p>
                            ) : null}
                          </li>
                        );
                      })}
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
                  )
                ) : null}
                {composePlacement === "panelEnd" ? renderComposeForm() : null}
                {!postOpen && !hideComposeCta ? (
                  <button
                    type="button"
                    className="home-dashboard__bulletin-cta"
                    onClick={() => {
                      setPostOpen(true);
                      setPostError(null);
                      setHiringCompany("");
                      setHiringTitle("");
                      setHiringLocation("");
                      setHiringDetails("");
                    }}
                  >
                    <span className="home-dashboard__bulletin-cta-icon" aria-hidden>
                      +
                    </span>
                    Compose
                  </button>
                ) : null}
              </div>
              {deleteConfirmIntentcastId ? (
                <div
                  className="home-dashboard__bulletin-delete-overlay"
                  role="presentation"
                  onClick={(e) => {
                    if (e.target === e.currentTarget && deleteSubmittingId == null) {
                      setDeleteConfirmIntentcastId(null);
                    }
                  }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="bulletin-delete-dialog-title"
                    aria-describedby="bulletin-delete-dialog-desc"
                    className="home-dashboard__bulletin-delete-dialog"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h2 id="bulletin-delete-dialog-title" className="home-dashboard__bulletin-delete-dialog-title">
                      {deleteConfirmIntentcast?.category === "hiring"
                        ? "Remove this hiring post?"
                        : "Remove this bulletin post?"}
                    </h2>
                    {deleteConfirmIntentcast ? (
                      <p className="home-dashboard__bulletin-delete-dialog-summary">
                        {intentcastDeleteSummaryText(deleteConfirmIntentcast)}
                      </p>
                    ) : null}
                    <p id="bulletin-delete-dialog-desc" className="home-dashboard__bulletin-delete-dialog-desc">
                      This removes the post from the bulletin for everyone. You’ll still see a private copy here (and any
                      replies) until the <strong>date on the card</strong>, when we permanently delete it. By default that
                      date is <strong>{BULLETIN_AUTHOR_DELETE_RETENTION_DAYS} days</strong> after removal—you can also{" "}
                      <strong>undo</strong> for {BULLETIN_AUTHOR_DELETE_UNDO_MINUTES} minutes.
                    </p>
                    <div className="home-dashboard__bulletin-delete-dialog-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setDeleteConfirmIntentcastId(null)}
                        disabled={deleteSubmittingId === deleteConfirmIntentcastId}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => void executeDeleteIntentcast(deleteConfirmIntentcastId)}
                        disabled={deleteSubmittingId === deleteConfirmIntentcastId}
                      >
                        {deleteSubmittingId === deleteConfirmIntentcastId ? "Removing…" : "Remove post"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
    );
  }
);

BulletinPanel.displayName = "BulletinPanel";
