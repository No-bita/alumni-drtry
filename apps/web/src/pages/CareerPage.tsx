import { Link } from "react-router-dom";
import "../styles/career-entry.css";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { CareerIntentFeedRows } from "../components/CareerIntentFeedRows";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { PostRoleHiringFlow, type PostRoleHiringFlowHandle } from "../components/PostRoleHiringFlow";
import type { IntentcastFeedResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";

function CareerOpportunitiesHub({
  onPostRole,
  onFindReferrals,
  onCanHelp,
  activityOpen,
  onToggleActivity,
  hiringNotice,
  onDismissNotice,
}: {
  onPostRole: () => void;
  onFindReferrals: () => void;
  onCanHelp: () => void;
  activityOpen: boolean;
  onToggleActivity: () => void;
  hiringNotice: string | null;
  onDismissNotice: () => void;
}) {
  return (
    <section className="career-entry" aria-labelledby="career-toolbar-title">
      <div className="career-entry__shell">
        {hiringNotice ? (
          <div className="career-hub__notice" role="status">
            <span>{hiringNotice}</span>
            <button type="button" className="career-hub__notice-dismiss" onClick={onDismissNotice}>
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="career-entry__actions">
          <button type="button" className="career-entry__primary" onClick={onFindReferrals}>
            Ask for a referral
          </button>
          <button type="button" className="career-entry__secondary" onClick={onPostRole}>
            Hire alumni
          </button>
        </div>
        <div className="career-entry__utilities">
          <Link to="/search">Browse alumni <span aria-hidden="true">→</span></Link>
          <button type="button" onClick={onCanHelp}>Offer help <span aria-hidden="true">→</span></button>
        </div>
        <div className="career-entry__activity">
          <h2 id="career-activity-title">Activity</h2>
          <button type="button" aria-expanded={activityOpen} aria-controls="career-activity-feed" onClick={onToggleActivity}>
            {activityOpen ? "Hide" : "View all"} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function navDisplayName(profile: { fullName?: string | null } | undefined, email: string | undefined): string {
  const fn = (profile?.fullName ?? "").trim() || profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

export function CareerPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const hiringFlowRef = useRef<PostRoleHiringFlowHandle>(null);
  const bulletinFlowRef = useRef<PostBulletinFlowHandle>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [hiringNotice, setHiringNotice] = useState<string | null>(null);
  const careerFeedQuery = useQuery({
    queryKey: queryKeys.career.intentFeed(),
    queryFn: ({ signal }) =>
      assertApiGet<IntentcastFeedResponse>(
        "/v1/intentcasts?limit=48&offset=0&excludeAuthorSoftDeleted=true&excludeCategories=guidance",
        signal
      ),
    enabled: auth.status === "authenticated",
  });

  const careerFeedLoading =
    auth.status === "authenticated" &&
    (careerFeedQuery.isPending ||
      (careerFeedQuery.isFetching && (careerFeedQuery.data?.intentcasts.length ?? 0) === 0));

  if (auth.status !== "authenticated") {
    return null;
  }

  const displayName =
    (auth.myProfile?.fullName ?? "").trim() ||
    auth.myProfile?.fullName?.trim() ||
    navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail);

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 id="career-toolbar-title" className="nav-app-toolbar__welcome-title">
              Careers
            </h1>
          </div>
        }
      />
      <CareerOpportunitiesHub
        onPostRole={() => hiringFlowRef.current?.open()}
        onFindReferrals={() => bulletinFlowRef.current?.open({ careersPreset: "referralSeeking" })}
        onCanHelp={() => bulletinFlowRef.current?.open({ careersPreset: "canHelp" })}
        activityOpen={activityOpen}
        onToggleActivity={() => setActivityOpen((open) => !open)}
        hiringNotice={hiringNotice}
        onDismissNotice={() => setHiringNotice(null)}
      />
      <div id="career-activity-feed" className="career-page-intent-feed" role="region" aria-labelledby="career-activity-title" hidden={!activityOpen}>
        <CareerIntentFeedRows
          intentcasts={careerFeedQuery.data?.intentcasts ?? []}
          loading={careerFeedLoading}
          error={careerFeedQuery.isError}
          viewerPersonId={auth.status === "authenticated" ? auth.person.personId : null}
          className="career-page-intent-feed__panel"
        />
      </div>
      <PostBulletinFlow
        ref={bulletinFlowRef}
        onPublishSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
        }}
      />
      <PostRoleHiringFlow
        ref={hiringFlowRef}
        onPublishSuccess={() => {
          setActivityOpen(true);
          setHiringNotice("Role published — it appears under Hiring on Home and Careers activity.");
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
        }}
      />
    </div>
  );
}
