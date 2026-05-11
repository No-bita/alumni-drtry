import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import type {
  LocationCleanupInboxResponse,
  LocationCleanupMergeSuggestion,
  LocationCleanupUnmappedCluster,
} from "../api/client";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";

function confidenceTone(confidence: "high" | "medium" | "low" | null | undefined): string {
  if (confidence === "high") return "location-cleanup__pill location-cleanup__pill--high";
  if (confidence === "medium") return "location-cleanup__pill location-cleanup__pill--medium";
  if (confidence === "low") return "location-cleanup__pill location-cleanup__pill--low";
  return "location-cleanup__pill location-cleanup__pill--muted";
}

function mergeFingerprint(row: LocationCleanupMergeSuggestion): string {
  return `${row.cityOneId}:${row.cityTwoId}`;
}

function clusterFingerprint(row: LocationCleanupUnmappedCluster): string {
  return `${row.normCountry}:${row.normCity}`;
}

export function AdminLocationCleanup() {
  const queryClient = useQueryClient();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [busyMergeKey, setBusyMergeKey] = useState<string | null>(null);
  const [busyClusterKey, setBusyClusterKey] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: queryKeys.admin.locationCleanup.inbox(),
    queryFn: async (): Promise<LocationCleanupInboxResponse> => {
      const { data, error } = await api.get<LocationCleanupInboxResponse>("/v1/admin/locations/cleanup/inbox");
      if (error || !data) {
        throw new Error(error?.message ?? error?.code ?? "Could not load the cleanup inbox.");
      }
      return data;
    },
  });

  const invalidateInbox = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.locationCleanup.inbox() });
  };

  const combineMutation = useMutation({
    mutationFn: async (payload: { keepCityId: string; combineCityId: string }) => {
      const { error } = await api.post("/v1/admin/locations/cleanup/actions/combine-cities", payload);
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not combine these cities.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      invalidateInbox();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const ignoreMergeMutation = useMutation({
    mutationFn: async (payload: { cityOneId: string; cityTwoId: string }) => {
      const { error } = await api.post("/v1/admin/locations/cleanup/actions/ignore-merge-suggestion", payload);
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not dismiss suggestion.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      invalidateInbox();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const mapClusterMutation = useMutation({
    mutationFn: async (payload: { displayCountry: string; displayCity: string; treatAsCityId: string }) => {
      const { error } = await api.post("/v1/admin/locations/cleanup/actions/map-free-text-to-city", payload);
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not approve spelling.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      invalidateInbox();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const createCityMutation = useMutation({
    mutationFn: async (payload: { displayCountry: string; displayCity: string }) => {
      const { error } = await api.post("/v1/admin/locations/cleanup/actions/create-city-from-text", payload);
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not create city.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      invalidateInbox();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const ignoreClusterMutation = useMutation({
    mutationFn: async (payload: { displayCountry: string; displayCity: string }) => {
      const { error } = await api.post("/v1/admin/locations/cleanup/actions/ignore-unmapped-cluster", payload);
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not dismiss entry.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      invalidateInbox();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const suggestedMerges = inboxQuery.data?.suggestedMerges ?? [];
  const unmappedClusters = inboxQuery.data?.unmappedClusters ?? [];
  const recentActivity = inboxQuery.data?.recentActivity ?? [];

  const mergeIntro = useMemo(
    () =>
      suggestedMerges.length === 0
        ? "No duplicate-looking cities surfaced right now."
        : "These pairs look like the same place. Confirm only when you agree.",
    [suggestedMerges.length]
  );

  const unmappedIntro = useMemo(
    () =>
      unmappedClusters.length === 0
        ? "Every profile residence text we saw is already tied to a primary city."
        : "Free-text locations still waiting to be tied to a primary city.",
    [unmappedClusters.length]
  );

  const navAvatarName = "Admin";

  return (
    <>
      <Nav variant="home" avatarName={navAvatarName} />
      <div className="home-dashboard location-cleanup-page">
        <div className="location-cleanup-page__inner">
          <header className="location-cleanup-page__header">
            <Link to="/home" className="profile-page__hero-back">
              ← Home
            </Link>
            <h1 className="home-dashboard__hero-title location-cleanup-page__title">Location cleanup inbox</h1>
            <p className="body-text location-cleanup-page__lede">
              Review suggestions, approve in one click, and skip anything that does not look right. You do not need to manage rows manually—the system handles the plumbing after you confirm.
            </p>
          </header>

          {bannerError ? (
            <div className="location-cleanup__banner location-cleanup__banner--error" role="alert">
              {bannerError}
            </div>
          ) : null}

          {inboxQuery.isPending ? (
            <p className="body-text" style={{ color: "var(--ink-muted)" }}>
              Loading inbox…
            </p>
          ) : inboxQuery.isError ? (
            <p className="body-text" style={{ color: "var(--color-danger)" }}>
              {(inboxQuery.error as Error)?.message ?? "Could not load inbox."}
            </p>
          ) : null}

          <section className="location-cleanup__section" aria-labelledby="lc-merge-heading">
            <div className="location-cleanup__section-head">
              <h2 id="lc-merge-heading" className="profile-page__section-title">
                Possible duplicates
              </h2>
              <button
                type="button"
                className="location-cleanup__ghost-btn"
                onClick={() => void inboxQuery.refetch()}
                disabled={inboxQuery.isFetching}
              >
                {inboxQuery.isFetching ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p className="body-text location-cleanup__muted">{mergeIntro}</p>
            <ul className="location-cleanup__card-list">
              {suggestedMerges.map((row) => {
                const key = mergeFingerprint(row);
                const busy =
                  busyMergeKey === key &&
                  (combineMutation.isPending || ignoreMergeMutation.isPending);
                return (
                  <li key={key} className="location-cleanup__card">
                    <div className="location-cleanup__card-top">
                      <span className={confidenceTone(row.confidence)}>
                        {row.confidence === "high"
                          ? "High confidence"
                          : row.confidence === "medium"
                            ? "Medium confidence"
                            : "Low confidence"}
                      </span>
                      <span className="location-cleanup__pill location-cleanup__pill--muted">{row.country}</span>
                    </div>
                    <p className="location-cleanup__pair-line">
                      <strong>{row.cityOneLabel}</strong>
                      <span aria-hidden> ↔ </span>
                      <strong>{row.cityTwoLabel}</strong>
                    </p>
                    <p className="body-text location-cleanup__muted">
                      <strong>{row.usersAffected}</strong> users affected · Primary label after combine:{" "}
                      <strong>{row.resultingCityLabel}</strong>
                    </p>
                    <div className="location-cleanup__actions">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={busy}
                        onClick={() => {
                          setBusyMergeKey(key);
                          combineMutation.mutate(
                            {
                              keepCityId: row.recommendedKeepCityId,
                              combineCityId: row.recommendedCombineCityId,
                            },
                            { onSettled: () => setBusyMergeKey(null) }
                          );
                        }}
                      >
                        Combine cities
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setBusyMergeKey(key);
                          ignoreMergeMutation.mutate(
                            { cityOneId: row.cityOneId, cityTwoId: row.cityTwoId },
                            { onSettled: () => setBusyMergeKey(null) }
                          );
                        }}
                      >
                        Not a duplicate
                      </Button>
                      <Link className="location-cleanup__text-link" to={`/admin/locations/places/${row.recommendedKeepCityId}`}>
                        Open primary city
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="location-cleanup__section" aria-labelledby="lc-unmapped-heading">
            <h2 id="lc-unmapped-heading" className="profile-page__section-title">
              Messy free-text locations
            </h2>
            <p className="body-text location-cleanup__muted">{unmappedIntro}</p>
            <ul className="location-cleanup__card-list">
              {unmappedClusters.map((row) => {
                const key = clusterFingerprint(row);
                const busy =
                  busyClusterKey === key &&
                  (mapClusterMutation.isPending || createCityMutation.isPending || ignoreClusterMutation.isPending);
                const suggestionLine =
                  row.suggestedTreatAsCityId && row.suggestedCityLabel ? (
                    <>
                      Likely same place as <strong>{row.suggestedCityLabel}</strong>
                      {row.suggestedCountryLabel ? (
                        <>
                          {" "}
                          ({row.suggestedCountryLabel})
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>No strong automatic match yet—create a new primary city or dismiss.</>
                  );

                return (
                  <li key={key} className="location-cleanup__card">
                    <div className="location-cleanup__card-top">
                      {row.suggestionConfidence ? (
                        <span className={confidenceTone(row.suggestionConfidence)}>
                          {row.suggestionConfidence === "high"
                            ? "Strong suggestion"
                            : row.suggestionConfidence === "medium"
                              ? "Possible match"
                              : "Weak suggestion"}
                        </span>
                      ) : (
                        <span className={confidenceTone(null)}>Needs review</span>
                      )}
                      <span className="location-cleanup__pill location-cleanup__pill--muted">
                        {row.profiles} users · sorted by usage
                      </span>
                    </div>
                    <p className="location-cleanup__free-text">
                      <strong>
                        {row.displayCity}, {row.displayCountry}
                      </strong>
                    </p>
                    <p className="body-text location-cleanup__muted">{suggestionLine}</p>
                    {row.lastSeenAt ? (
                      <p className="body-text location-cleanup__muted">
                        Last profile update touching this text: {new Date(row.lastSeenAt).toLocaleString()}
                      </p>
                    ) : null}
                    <div className="location-cleanup__actions location-cleanup__actions--wrap">
                      {row.suggestedTreatAsCityId ? (
                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy}
                          onClick={() => {
                            setBusyClusterKey(key);
                            mapClusterMutation.mutate(
                              {
                                displayCountry: row.displayCountry,
                                displayCity: row.displayCity,
                                treatAsCityId: row.suggestedTreatAsCityId!,
                              },
                              { onSettled: () => setBusyClusterKey(null) }
                            );
                          }}
                        >
                          Treat as {row.suggestedCityLabel ?? "suggested city"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setBusyClusterKey(key);
                          createCityMutation.mutate(
                            { displayCountry: row.displayCountry, displayCity: row.displayCity },
                            { onSettled: () => setBusyClusterKey(null) }
                          );
                        }}
                      >
                        Create separate city
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setBusyClusterKey(key);
                          ignoreClusterMutation.mutate(
                            { displayCountry: row.displayCountry, displayCity: row.displayCity },
                            { onSettled: () => setBusyClusterKey(null) }
                          );
                        }}
                      >
                        Ignore for now
                      </Button>
                      {row.suggestedTreatAsCityId ? (
                        <Link className="location-cleanup__text-link" to={`/admin/locations/places/${row.suggestedTreatAsCityId}`}>
                          View suggested city
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="location-cleanup__section" aria-labelledby="lc-audit-heading">
            <h2 id="lc-audit-heading" className="profile-page__section-title">
              Recent cleanup activity
            </h2>
            {recentActivity.length === 0 ? (
              <p className="body-text location-cleanup__muted">No actions recorded yet.</p>
            ) : (
              <ol className="location-cleanup__audit">
                {recentActivity.map((item, idx) => (
                  <li key={`${item.at}-${idx}`}>
                    <span className="location-cleanup__audit-summary">{item.summary}</span>
                    <time className="location-cleanup__audit-time" dateTime={item.at}>
                      {new Date(item.at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
