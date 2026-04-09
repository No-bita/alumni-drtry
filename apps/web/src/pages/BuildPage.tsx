import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { BuildPostCard, type BuildPostCardProps } from "../components/BuildPostCard";
import { Button } from "../components/Button";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { IntentcastFeedItem, IntentcastFeedResponse } from "../api/client";
import { buildBuildPostContent, parseBuildPostContent } from "../lib/buildPostContent";

function navDisplayName(profile: { fullName?: string | null } | undefined, email: string | undefined): string {
  const fn = profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

const BUILD_FEED_CATEGORY: IntentcastFeedItem["category"] = "collaboration";
const BUILD_PAGE_SIZE = 20;

/** Demo cards retained until Build adoption ramps up. */
const DEMO_BUILD_FEED: BuildPostCardProps[] = [
  {
    title: "Looking for a technical co-founder",
    industry: "Marketing technology",
    description: "Building a SaaS tool for D2C brands to optimise ads",
    posterName: "Ananya Das",
    posterCompany: "Deloitte Digital",
    actions: [{ label: "Help" }, { label: "View" }],
  },
  {
    title: "Open-source design system for campus clubs",
    industry: "Developer tools",
    description: "Need a React + Figma contributor for documentation and a11y pass",
    posterName: "Rohan Mehta",
    posterCompany: "MonoFin",
    actions: [{ label: "Help" }],
  },
  {
    title: "Hardware lab hours in Bangalore",
    industry: "Robotics",
    description: "Sharing bench space and basic tools for alumni building prototypes",
    posterName: "Priya Nair",
    posterCompany: "SensoMotion",
    actions: [{ label: "View" }],
  },
];

/**
 * Build hub: alumni projects, collaborations, and ideas — feed of post cards (UI shell; data is demo for now).
 */
export function BuildPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const panelRootRef = useRef<HTMLElement | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");

  const resetCompose = () => {
    setPostError(null);
    setTitle("");
    setIndustry("");
    setDescription("");
  };

  const displayName = useMemo(() => {
    if (auth.status !== "authenticated") return "";
    return (
      auth.myProfile?.fullName?.trim() ||
      navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail)
    );
  }, [auth]);

  if (auth.status !== "authenticated") {
    return null;
  }

  const buildFeedQueryKey = queryKeys.intentcasts.feedInfinite({
    category: BUILD_FEED_CATEGORY,
    mine: false,
    authorHistory: false,
    excludeAuthorSoftDeleted: false,
    retryNonce: 0,
  });

  const feedInfinite = useInfiniteQuery({
    queryKey: buildFeedQueryKey,
    queryFn: async ({ pageParam, signal }) => {
      const offset = pageParam as number;
      const q = new URLSearchParams({
        limit: String(BUILD_PAGE_SIZE),
        offset: String(offset),
        category: BUILD_FEED_CATEGORY,
      });
      return assertApiGet<IntentcastFeedResponse>(`/v1/intentcasts?${q.toString()}`, signal);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextOffset ?? undefined,
    enabled: auth.status === "authenticated",
  });

  const intentcasts = useMemo(() => {
    if (!feedInfinite.data) return [];
    return feedInfinite.data.pages.flatMap((p) => p.intentcasts);
  }, [feedInfinite.data]);

  useEffect(() => {
    if (!composeOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !postSubmitting) setComposeOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [composeOpen, postSubmitting]);

  const openCompose = () => {
    resetCompose();
    setComposeOpen(true);
    panelRootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePost = async () => {
    const t = title.trim();
    const ind = industry.trim();
    const d = description.trim();
    const content = buildBuildPostContent({
      title: t,
      industry: ind,
      description: d,
    });

    if (!t) {
      setPostError("Add a title.");
      return;
    }
    if (!d) {
      setPostError("Add 1-2 lines describing what you’re building.");
      return;
    }
    if (!ind) {
      setPostError("Add the industry you’re building in.");
      return;
    }
    if (content.length < 10) {
      setPostError("Post must be at least 10 characters.");
      return;
    }

    setPostError(null);
    setPostSubmitting(true);
    const { data, error } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
      category: BUILD_FEED_CATEGORY,
      content,
    });
    setPostSubmitting(false);

    const posted = data?.intentcast;
    if (error || !posted) {
      setPostError(error?.message ?? error?.code ?? "Could not post.");
      return;
    }

    queryClient.setQueryData(buildFeedQueryKey, (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const o = old as { pageParams?: unknown[]; pages?: IntentcastFeedResponse[] };
      if (!o.pages || o.pages.length === 0) return old;
      const [first, ...rest] = o.pages;
      if (!first) return old;
      return {
        ...o,
        pages: [
          {
            ...first,
            intentcasts: [posted, ...first.intentcasts.filter((x) => x.id !== posted.id)],
          },
          ...rest,
        ],
      };
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
    resetCompose();
    setComposeOpen(false);
  };

  const cards: BuildPostCardProps[] = intentcasts.map((ic) => {
    const parsed = parseBuildPostContent(ic.content);
    const company = ic.authorCurrentOrganizationName?.trim() ?? "";
    return {
      title: parsed.title || "Build update",
      industry: parsed.industry || undefined,
      description: parsed.description || ic.content.trim(),
      posterName: ic.authorFullName || "Alumni",
      posterCompany: company || undefined,
      posterProfileId: ic.authorPersonId || undefined,
      posterDepartmentCode: ic.authorDepartmentCode,
      actions: [{ label: "Help" }, { label: "View" }],
    };
  });

  const showDemoFeed = feedInfinite.isError || (feedInfinite.isSuccess && cards.length === 0);
  const cardsToRender = showDemoFeed ? DEMO_BUILD_FEED : cards;

  const previewContent = useMemo(() => {
    const fallbackTitle = "Looking for a technical co-founder";
    const fallbackDesc = "Building a SaaS tool for D2C brands to optimise ads";
    return buildBuildPostContent({
      title: title.trim() || fallbackTitle,
      industry: industry.trim() || "Marketing technology",
      description: description.trim() || fallbackDesc,
    });
  }, [title, industry, description]);

  const previewParsed = useMemo(() => parseBuildPostContent(previewContent), [previewContent]);
  const previewCompany = "Company name";

  return (
    <div className="intent-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <div className="build-page">
        <header className="build-page__hero">
          <h1 className="build-page__hero-title">Build with alumni — projects, collaborators, and ideas.</h1>
          <p className="build-page__hero-lede">
            What people are making and who they’re looking for — projects, collaborators, and ideas from the alumni
            community. Sample posts below until live publishing is enabled.
          </p>
        </header>

        <div className="build-page__body">
          <section ref={panelRootRef} className="build-page__main" aria-labelledby="build-feed-heading">
            <div className="build-page__listings-head">
              <h2 id="build-feed-heading" className="build-page__feed-title">
                Feed
              </h2>
              <div style={{ marginTop: "var(--space-md)" }}>
                <Button type="button" variant="primary" onClick={openCompose}>
                  Compose post
                </Button>
              </div>
            </div>
            <div className="build-page__feed" aria-label="Build posts">
              {feedInfinite.isPending ? (
                <p className="home-dashboard__bulletin-empty">Loading posts…</p>
              ) : (
                <>
                  {showDemoFeed ? (
                    <p className="home-dashboard__bulletin-empty" style={{ marginBottom: "var(--space-md)" }}>
                      Showing sample posts for now.
                    </p>
                  ) : null}
                  {cardsToRender.map((card, i) => (
                    <BuildPostCard
                      key={`${card.title}-${i}`}
                      {...card}
                      posterProfileId={card.posterProfileId ?? auth.person.personId}
                    />
                  ))}
                  {!showDemoFeed && feedInfinite.hasNextPage ? (
                    <div style={{ marginTop: "var(--space-md)" }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void feedInfinite.fetchNextPage()}
                        disabled={feedInfinite.isFetchingNextPage}
                      >
                        {feedInfinite.isFetchingNextPage ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  ) : null}
                  {feedInfinite.isError ? (
                    <div className="home-dashboard__bulletin-load-more-error" style={{ marginTop: "var(--space-md)" }}>
                      <p>Couldn’t load build posts.</p>
                      <button type="button" onClick={() => void feedInfinite.refetch()}>
                        Retry
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
      {composeOpen ? (
        <div
          className="home-dashboard__bulletin-compose-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !postSubmitting) setComposeOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="build-compose-title"
            className="home-dashboard__bulletin-compose-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="home-dashboard__bulletin-compose-close"
              aria-label="Close build post dialog"
              onClick={() => setComposeOpen(false)}
              disabled={postSubmitting}
            >
              ×
            </button>
            <div className="home-dashboard__bulletin-compose home-dashboard__bulletin-compose--modal">
              <p id="build-compose-title" className="home-dashboard__bulletin-compose-label">
                New build post
              </p>
              <div className="home-dashboard__bulletin-hiring-form">
                <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                  <label className="ui-label" htmlFor="build-compose-title-field">
                    Title
                  </label>
                  <input
                    id="build-compose-title-field"
                    className="input"
                    type="text"
                    placeholder="Looking for a technical co-founder"
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
                <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                  <label className="ui-label" htmlFor="build-compose-description-field">
                    What are you building?
                  </label>
                  <div className="home-dashboard__textarea-with-counter">
                    <textarea
                      id="build-compose-description-field"
                      className="input home-dashboard__respond-textarea home-dashboard__respond-textarea--with-counter"
                      rows={3}
                      placeholder="Building a SaaS tool for D2C brands to optimise ads"
                      maxLength={1500}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={postSubmitting}
                    />
                    <span className="home-dashboard__textarea-counter" aria-live="polite">
                      {description.length} / 1500
                    </span>
                  </div>
                </div>
                <div className="home-dashboard__bulletin-hiring-field">
                  <label className="ui-label" htmlFor="build-compose-industry-field">
                    Which industry are you building in?
                  </label>
                  <input
                    id="build-compose-industry-field"
                    className="input"
                    type="text"
                    placeholder="Marketing technology"
                    maxLength={80}
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
              </div>

              <div className="home-dashboard__bulletin-hiring-preview">
                <p className="home-dashboard__bulletin-hiring-preview-label" id="build-live-preview">
                  Live preview
                </p>
                <div
                  className="home-dashboard__bulletin-hiring-preview-surface"
                  role="region"
                  aria-labelledby="build-live-preview"
                >
                  <BuildPostCard
                    title={previewParsed.title}
                    industry={previewParsed.industry || undefined}
                    description={previewParsed.description}
                    posterName={auth.myProfile?.fullName?.trim() || displayName}
                    posterCompany={previewCompany}
                    posterProfileId={auth.person.personId}
                    posterDepartmentCode={auth.myProfile?.departmentCode ?? auth.myProfile?.parsedDepartmentCode ?? null}
                    actions={[{ label: "Help" }, { label: "View" }]}
                  />
                </div>
              </div>

              {postError ? <p className="home-dashboard__respond-error">{postError}</p> : null}
              <div className="home-dashboard__respond-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (postSubmitting) return;
                    setComposeOpen(false);
                    resetCompose();
                  }}
                  disabled={postSubmitting}
                >
                  Cancel
                </Button>
                <Button type="button" variant="primary" onClick={() => void handlePost()} disabled={postSubmitting}>
                  {postSubmitting ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
