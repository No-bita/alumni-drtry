/**
 * Archived implementation of `/intent/build` (full hub). Not imported in production routes.
 * Active placeholder: `./BuildPage.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { BuildPostCard, type BuildPostCardProps } from "../components/BuildPostCard";
import { Button } from "../components/Button";
import { useAuth } from "../contexts/AuthContext";
import { api, type CreateConnectionThreadResponse } from "../api/client";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { IntentcastFeedItem, IntentcastFeedResponse } from "../api/client";
import { buildBuildPostContent, parseBuildPostContent } from "../lib/buildPostContent";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import {
  DEFAULT_BUILD_FILTERS,
  filterBuildProjects,
  mapIntentcastToBuildProject,
  type BuildProject,
} from "../lib/buildShowcase";
import { BuildFilters } from "../components/build/BuildFilters";
import { BuildProjectDetailPanel } from "../components/build/BuildProjectDetailPanel";

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
export function BuildPageLegacy() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isAuthenticated = auth.status === "authenticated";
  const myPersonId = isAuthenticated ? auth.person.personId : undefined;
  const queryClient = useQueryClient();
  const panelRootRef = useRef<HTMLElement | null>(null);
  const composeDialogRef = useRef<HTMLDivElement | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_BUILD_FILTERS);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [supportSignalsSent, setSupportSignalsSent] = useState<Array<{ id: string; kind: string; title: string }>>([]);
  const [title, setTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [projectName, setProjectName] = useState("");
  const [oneLinePitch, setOneLinePitch] = useState("");
  const [stage, setStage] = useState<"" | "idea" | "prototype" | "launched" | "scaling">("");
  const [domain, setDomain] = useState("");
  const [supportNeeded, setSupportNeeded] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [links, setLinks] = useState("");
  const [askDetails, setAskDetails] = useState("");
  useBodyScrollLock(composeOpen);
  useDialogFocusManager({
    open: composeOpen,
    containerRef: composeDialogRef,
    onClose: postSubmitting ? undefined : () => setComposeOpen(false),
  });

  const resetCompose = () => {
    setPostError(null);
    setTitle("");
    setIndustry("");
    setDescription("");
    setProjectName("");
    setOneLinePitch("");
    setStage("");
    setDomain("");
    setSupportNeeded([]);
    setLocation("");
    setLinks("");
    setAskDetails("");
  };

  const displayName = useMemo(() => {
    if (!isAuthenticated) return "";
    return (
      auth.myProfile?.fullName?.trim() ||
      navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail)
    );
  }, [auth, isAuthenticated]);

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
    enabled: isAuthenticated,
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

  const openCompose = useCallback(() => {
    setPostError(null);
    setTitle("");
    setIndustry("");
    setDescription("");
    setProjectName("");
    setOneLinePitch("");
    setStage("");
    setDomain("");
    setSupportNeeded([]);
    setLocation("");
    setLinks("");
    setAskDetails("");
    setComposeOpen(true);
    panelRootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    const t = window.setTimeout(() => {
      openCompose();
    }, 0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("compose");
      return next;
    }, { replace: true });
    return () => window.clearTimeout(t);
  }, [openCompose, searchParams, setSearchParams]);

  const handlePost = async () => {
    const t = title.trim();
    const ind = industry.trim();
    const d = description.trim();
    const linksList = links
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const content = buildBuildPostContent({
      title: t,
      industry: ind,
      description: d,
      projectName,
      oneLinePitch,
      stage: stage || undefined,
      domain,
      supportNeeded: supportNeeded.length
        ? supportNeeded.filter(
            (value): value is "mentorship" | "clients" | "funding" | "cofounder" | "distribution" =>
              value === "mentorship" ||
              value === "clients" ||
              value === "funding" ||
              value === "cofounder" ||
              value === "distribution"
          )
        : undefined,
      location,
      links: linksList,
      askDetails,
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

  const projects = useMemo(() => intentcasts.map((ic) => mapIntentcastToBuildProject(ic)), [intentcasts]);
  const visibleProjects = useMemo(() => filterBuildProjects(projects, filters), [projects, filters]);
  const selectedProject = useMemo(
    () => (selectedProjectId ? visibleProjects.find((project) => project.intentcastId === selectedProjectId) ?? null : null),
    [selectedProjectId, visibleProjects]
  );
  const showDemoFeed = feedInfinite.isError || (feedInfinite.isSuccess && visibleProjects.length === 0);
  const cardsToRender: BuildPostCardProps[] = showDemoFeed
    ? DEMO_BUILD_FEED
    : visibleProjects.map((project) => ({
        title: project.title,
        oneLinePitch: project.oneLinePitch,
        industry: project.domain || undefined,
        stage: project.stage || undefined,
        domain: project.domain || undefined,
        supportNeeded: project.supportNeeded,
        location: project.location || undefined,
        description: project.description,
        posterName: project.authorName,
        posterCompany: project.authorCompany ?? undefined,
        posterProfileId: project.authorPersonId,
        actions: [{ label: "View project", onClick: () => setSelectedProjectId(project.intentcastId) }],
      }));

  const previewContent = useMemo(() => {
    const fallbackTitle = "Looking for a technical co-founder";
    const fallbackDesc = "Building a SaaS tool for D2C brands to optimise ads";
    return buildBuildPostContent({
      title: title.trim() || fallbackTitle,
      industry: industry.trim() || "Marketing technology",
      description: description.trim() || fallbackDesc,
      projectName: projectName.trim() || "Project Atlas",
      oneLinePitch: oneLinePitch.trim() || "Workflow intelligence for operations teams",
      stage: stage || "prototype",
      domain: domain.trim() || "SaaS",
      supportNeeded:
        supportNeeded.length > 0
          ? supportNeeded.filter(
              (value): value is "mentorship" | "clients" | "funding" | "cofounder" | "distribution" =>
                value === "mentorship" ||
                value === "clients" ||
                value === "funding" ||
                value === "cofounder" ||
                value === "distribution"
            )
          : ["mentorship", "clients"],
      location: location.trim() || "Bengaluru",
      links: links
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 2),
      askDetails: askDetails.trim() || "Looking for pilot customers and product mentorship.",
    });
  }, [title, industry, description, projectName, oneLinePitch, stage, domain, supportNeeded, location, links, askDetails]);

  const previewParsed = useMemo(() => parseBuildPostContent(previewContent), [previewContent]);
  const previewCompany = "Company name";

  const handleSignalSupport = async (
    project: BuildProject,
    kind: "mentorship" | "clients" | "funding"
  ): Promise<void> => {
    const messageByKind: Record<typeof kind, string> = {
      mentorship: `Support signal: I can mentor your project "${project.title}".`,
      clients: `Support signal: I may be able to support "${project.title}" as a client/partner.`,
      funding: `Support signal: I am interested in the fundraising path for "${project.title}".`,
    };
    const { error } = await api.post(`/v1/intentcasts/${project.intentcastId}/respond`, {
      message: messageByKind[kind],
    });
    if (error) {
      throw new Error(error.message ?? error.code);
    }
    setSupportSignalsSent((prev) => [{ id: project.intentcastId, kind, title: project.title }, ...prev].slice(0, 6));
    queryClient.setQueryData(buildFeedQueryKey, (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const o = old as { pages?: IntentcastFeedResponse[] };
      if (!o.pages) return old;
      return {
        ...o,
        pages: o.pages.map((page) => ({
          ...page,
          intentcasts: page.intentcasts.map((item) =>
            item.id === project.intentcastId
              ? {
                  ...item,
                  viewerHasResponded: true,
                  responseCount: item.responseCount + 1,
                }
              : item
          ),
        })),
      };
    });
  };

  const handleConnect = async (project: BuildProject): Promise<void> => {
    const { data, error } = await api.post<CreateConnectionThreadResponse>("/v1/connection-threads", {
      recipientPersonId: project.authorPersonId,
      initialMessage: `Hi ${project.authorName.split(" ")[0] ?? "there"}, I saw "${project.title}" on Build and would like to connect.`,
    });
    if (error || !data?.threadId) {
      throw new Error(error?.message ?? error?.code ?? "Could not open a connection thread.");
    }
    navigate(`/connections/${data.threadId}`);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="intent-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <div className={`build-page${composeOpen ? " build-page--compose-open" : ""}`}>
        <header className="build-page__hero">
          <h1 className="build-page__hero-title">Show what you&apos;re building. Find mentors, clients, and supporters.</h1>
          <p className="build-page__hero-lede">
            Discover alumni projects, understand what support they need, and send a clear support signal in one click.
          </p>
          <div className="build-page__hero-actions">
            <Button type="button" variant="primary" onClick={openCompose}>
              Create showcase
            </Button>
          </div>
        </header>

        <div className="build-page__body">
          <section ref={panelRootRef} className="build-page__main build-page__main--grid" aria-labelledby="build-feed-heading">
            <div className="build-page__left">
              <div className="build-page__listings-head">
                <h2 id="build-feed-heading" className="build-page__feed-title">
                  Project showcase
                </h2>
                <p className="build-page__feed-lede">Filter by stage and support need to find high-context projects quickly.</p>
              </div>
              <BuildFilters value={filters} onChange={setFilters} />
              <div className="build-page__feed" aria-label="Build posts">
                {feedInfinite.isPending ? (
                  <div className="build-page__state-block" role="status" aria-live="polite">
                    <p className="build-page__state-title">Loading projects…</p>
                    <p className="build-page__state-copy">Fetching the latest builder showcases from alumni.</p>
                  </div>
                ) : (
                  <>
                    {showDemoFeed ? (
                      <p className="home-dashboard__bulletin-empty" style={{ marginBottom: "var(--space-md)" }}>
                        Showing sample projects while live posts load.
                      </p>
                    ) : null}
                    {!showDemoFeed && cardsToRender.length === 0 ? (
                      <div className="build-page__state-block" role="status">
                        <p className="build-page__state-title">No projects match these filters.</p>
                        <p className="build-page__state-copy">Try broadening stage or support filters.</p>
                      </div>
                    ) : (
                      cardsToRender.map((card, i) => (
                        <BuildPostCard
                          key={`${card.title}-${i}`}
                          {...card}
                          posterProfileId={card.posterProfileId ?? myPersonId}
                        />
                      ))
                    )}
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
                        <p>Couldn’t load build projects.</p>
                        <button type="button" onClick={() => void feedInfinite.refetch()}>
                          Retry
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <aside className="build-page__right">
              <BuildProjectDetailPanel
                project={selectedProject}
                onClose={() => setSelectedProjectId(null)}
                onSignalSupport={handleSignalSupport}
                onConnect={handleConnect}
              />
              <section className="build-page__supported" aria-labelledby="build-supported-heading">
                <h3 id="build-supported-heading" className="build-page__supported-title">
                  Projects you supported
                </h3>
                {supportSignalsSent.length === 0 ? (
                  <p className="build-page__supported-empty">No support signals sent yet.</p>
                ) : (
                  <ul className="build-page__supported-list">
                    {supportSignalsSent.map((item, idx) => (
                      <li key={`${item.id}-${idx}`} className="build-page__supported-item">
                        <span>{item.title}</span>
                        <small>{item.kind}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
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
            ref={composeDialogRef}
            tabIndex={-1}
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
                  <label className="ui-label" htmlFor="build-compose-project-name-field">
                    Project name
                  </label>
                  <input
                    id="build-compose-project-name-field"
                    className="input"
                    type="text"
                    placeholder="Project Atlas"
                    maxLength={120}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
                <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                  <label className="ui-label" htmlFor="build-compose-one-line-field">
                    One-line pitch
                  </label>
                  <input
                    id="build-compose-one-line-field"
                    className="input"
                    type="text"
                    placeholder="Workflow intelligence for operations teams"
                    maxLength={160}
                    value={oneLinePitch}
                    onChange={(e) => setOneLinePitch(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
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
                    Domain / industry
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
                <div className="home-dashboard__bulletin-hiring-field">
                  <label className="ui-label" htmlFor="build-compose-stage-field">
                    Stage
                  </label>
                  <select
                    id="build-compose-stage-field"
                    className="input"
                    value={stage}
                    onChange={(e) => setStage(e.target.value as "" | "idea" | "prototype" | "launched" | "scaling")}
                    disabled={postSubmitting}
                  >
                    <option value="">Select stage</option>
                    <option value="idea">Idea</option>
                    <option value="prototype">Prototype</option>
                    <option value="launched">Launched</option>
                    <option value="scaling">Scaling</option>
                  </select>
                </div>
                <div className="home-dashboard__bulletin-hiring-field">
                  <label className="ui-label" htmlFor="build-compose-domain-field">
                    Domain
                  </label>
                  <input
                    id="build-compose-domain-field"
                    className="input"
                    type="text"
                    placeholder="Fintech, health, SaaS"
                    maxLength={80}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
                <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                  <label className="ui-label" htmlFor="build-compose-support-field">
                    Support needed (comma-separated)
                  </label>
                  <input
                    id="build-compose-support-field"
                    className="input"
                    type="text"
                    placeholder="mentorship, clients, funding"
                    maxLength={120}
                    value={supportNeeded.join(", ")}
                    onChange={(e) =>
                      setSupportNeeded(
                        e.target.value
                          .split(",")
                          .map((item) => item.trim().toLowerCase())
                          .filter(Boolean)
                      )
                    }
                    disabled={postSubmitting}
                  />
                </div>
                <div className="home-dashboard__bulletin-hiring-field">
                  <label className="ui-label" htmlFor="build-compose-location-field">
                    Location
                  </label>
                  <input
                    id="build-compose-location-field"
                    className="input"
                    type="text"
                    placeholder="Bengaluru"
                    maxLength={80}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
                <div className="home-dashboard__bulletin-hiring-field">
                  <label className="ui-label" htmlFor="build-compose-links-field">
                    Links (comma-separated)
                  </label>
                  <input
                    id="build-compose-links-field"
                    className="input"
                    type="text"
                    placeholder="https://demo.app, https://deck.link"
                    maxLength={400}
                    value={links}
                    onChange={(e) => setLinks(e.target.value)}
                    disabled={postSubmitting}
                  />
                </div>
                <div className="home-dashboard__bulletin-hiring-field home-dashboard__bulletin-hiring-field--wide">
                  <label className="ui-label" htmlFor="build-compose-ask-field">
                    Current ask
                  </label>
                  <input
                    id="build-compose-ask-field"
                    className="input"
                    type="text"
                    placeholder="Looking for pilot customers and product mentors."
                    maxLength={180}
                    value={askDetails}
                    onChange={(e) => setAskDetails(e.target.value)}
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
                    title={previewParsed.projectName || previewParsed.title}
                    oneLinePitch={previewParsed.oneLinePitch || undefined}
                    industry={previewParsed.industry || undefined}
                    stage={previewParsed.stage || undefined}
                    domain={previewParsed.domain || undefined}
                    supportNeeded={previewParsed.supportNeeded}
                    location={previewParsed.location || undefined}
                    description={previewParsed.description}
                    posterName={auth.myProfile?.fullName?.trim() || displayName}
                    posterCompany={previewCompany}
                    posterProfileId={auth.person.personId}
                    actions={[{ label: "View project" }, { label: "Support" }]}
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
