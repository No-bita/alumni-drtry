import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BulletinCardTone } from "../lib/bulletinPostCardUtils";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import { BulletinDeleteIntentcastDialog } from "./BulletinDeleteIntentcastDialog";
import { BulletinOwnPostMenu } from "./BulletinOwnPostMenu";
import { BulletinPostCard } from "./BulletinPostCard";
import { IconBriefcase, IconCity, IconRefer } from "./HomeIcons";

export type HomeOpportunityCategory = "all" | "careers" | "hiring" | "relocation" | "startups" | "guidance";
type HomeOpportunityCategoryLegacy = HomeOpportunityCategory | "referrals" | "moving_cities";

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
  authorIsDemo?: boolean;
  title: string;
  summary: string;
  chips: string[];
  category: HomeOpportunityCategoryLegacy;
};

/** Max posts shown in the home Bulletin stack (per active category). */
export const HOME_OPPORTUNITY_RAIL_PAGE_SIZE = 48;

type HomeOpportunityRailProps = {
  items: HomeOpportunityItem[];
  activeCategory: HomeOpportunityCategory;
  onCategoryChange: (category: HomeOpportunityCategory) => void;
  categoryCounts: Record<Exclude<HomeOpportunityCategory, "all">, number>;
  /** When true, hide the empty state until the intentcasts feed has finished its initial load (or equivalent fetch). */
  opportunitiesFeedLoading?: boolean;
  /** Signed-in viewer id — own posts get a delete menu. */
  viewerPersonId?: string | null;
};

const CATEGORIES: Array<{ id: Exclude<HomeOpportunityCategory, "all">; label: string }> = [
  { id: "careers", label: "Careers" },
  { id: "hiring", label: "Hiring" },
  { id: "relocation", label: "Relocation" },
  { id: "startups", label: "Startups" },
  { id: "guidance", label: "Guidance" },
];

const CATEGORY_BADGE: Record<Exclude<HomeOpportunityCategory, "all">, string> = {
  careers: "Careers",
  hiring: "Hiring",
  relocation: "Relocation",
  startups: "Startups",
  guidance: "Guidance",
};

function homeOpportunityTone(cat: HomeOpportunityCategory): BulletinCardTone {
  switch (cat) {
    case "all":
      return "referrals";
    case "careers":
      return "referrals";
    case "guidance":
      return "referrals";
    case "relocation":
    case "startups":
      return "moving_cities";
    case "hiring":
      return "hiring";
  }
}

/** Aligns legacy mock / feed category values with the chip ids used for filtering + counts */
export function normalizeHomeOpportunityCategory(cat: HomeOpportunityCategoryLegacy): Exclude<HomeOpportunityCategory, "all"> {
  switch (cat) {
    case "referrals":
      return "careers";
    case "moving_cities":
      return "relocation";
    case "careers":
    case "hiring":
    case "relocation":
    case "startups":
    case "guidance":
      return cat;
    case "all":
      return "careers";
  }
}

function homeOpportunityBadgeLabel(cat: HomeOpportunityCategory): string {
  if (cat === "all") return "Post";
  return CATEGORY_BADGE[cat];
}

export function HomeOpportunityRail({
  items,
  activeCategory,
  onCategoryChange,
  categoryCounts,
  opportunitiesFeedLoading = false,
  viewerPersonId = null,
}: HomeOpportunityRailProps) {
  const queryClient = useQueryClient();
  const normalizedItems = items.map((item) => ({ ...item, category: normalizeHomeOpportunityCategory(item.category) }));
  const filteredItems = (
    activeCategory === "all" ? normalizedItems : normalizedItems.filter((item) => item.category === activeCategory)
  ).slice(0, HOME_OPPORTUNITY_RAIL_PAGE_SIZE);

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
          return;
        }
        setRailDeleteError(error.message ?? error.code ?? "Could not remove post.");
        return;
      }
      setDeleteConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
    },
    [queryClient]
  );

  return (
    <section className="home-ideal__opportunities ds-surface-card" aria-labelledby="home-opportunities-heading">
      <header className="home-ideal__opportunities-header ds-section-head">
        <div className="home-ideal__opportunities-headcopy">
          <h2 id="home-opportunities-heading" className="home-ideal__opportunities-title ds-title-lg">
            Active Requests
          </h2>
        </div>
      </header>
      {railDeleteError ? (
        <p className="home-dashboard__bulletin-inline-error home-ideal__opportunity-rail-error" role="alert">
          {railDeleteError}
        </p>
      ) : null}
      <div className="home-ideal__chips" role="tablist" aria-label="Opportunity filters">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`home-ideal__chip home-ideal__chip--${category.id} ds-chip${activeCategory === category.id ? " home-ideal__chip--active ds-chip--active" : ""}`}
            onClick={() => onCategoryChange(activeCategory === category.id ? "all" : category.id)}
          >
            <span className={`home-ideal__chip-icon home-ideal__chip-icon--${category.id}`} aria-hidden>
              {category.id === "careers" ? <IconRefer /> : null}
              {category.id === "guidance" ? <IconRefer /> : null}
              {category.id === "hiring" ? <IconBriefcase /> : null}
              {category.id === "relocation" ? <IconCity /> : null}
              {category.id === "startups" ? <IconBriefcase /> : null}
            </span>
            {category.label}
            <span className="home-ideal__chip-count">{categoryCounts[category.id]}</span>
          </button>
        ))}
      </div>
      {opportunitiesFeedLoading ? (
        <div className="home-ideal__empty" role="status" aria-live="polite">
          <p>Loading active requests…</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="home-ideal__empty">
          <p>No posts in this category yet.</p>
        </div>
      ) : (
        <div
          className="home-ideal__opportunity-feed"
          role="region"
          aria-label="Active requests — swipe or scroll sideways to see more"
        >
          <ul className="home-ideal__opportunity-feed-list" role="list">
            {filteredItems.map((item) => {
              const postChips = item.chips.filter(Boolean).slice(0, 4);
              const isOwn = Boolean(viewerPersonId && item.personId === viewerPersonId);
              return (
                <li key={item.id}>
                  <BulletinPostCard
                    variant="rail"
                    personProfileHref={`/profiles/${item.personId}`}
                    authorFullName={item.fullName}
                    departmentCode={item.departmentCode}
                    batchYear={item.batchYear}
                    postedRelative={item.postedRelative ?? null}
                    postedAtIso={item.postedAtIso ?? null}
                    authorIsDemo={Boolean(item.authorIsDemo)}
                    tone={homeOpportunityTone(item.category)}
                    categoryBadgeLabel={homeOpportunityBadgeLabel(item.category)}
                    title={item.title}
                    summary={item.summary}
                    chips={postChips}
                    ownerActions={
                      isOwn ? (
                        <BulletinOwnPostMenu
                          detachDropdown
                          deleteDisabled={deleteSubmittingId === item.id}
                          onRequestDelete={() => setDeleteConfirmId(item.id)}
                        />
                      ) : undefined
                    }
                    footer={
                      isOwn ? undefined : (
                        <div className="bb-post-card__actions ds-action-row ds-action-row--single">
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => {
                              window.dispatchEvent(
                                new CustomEvent("messaging:open-draft", {
                                  detail: {
                                    recipientPersonId: item.personId,
                                    recipientName: item.fullName,
                                    initialMessage: "",
                                    kind: "general",
                                    requestTitle: item.title,
                                    recipientDepartmentCode: item.departmentCode,
                                    recipientBatchYear: item.batchYear,
                                  },
                                })
                              );
                            }}
                          >
                            Message
                          </button>
                        </div>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
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
