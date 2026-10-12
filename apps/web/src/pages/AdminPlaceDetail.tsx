import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import type { AdminPlacesListResponse, LocationCleanupPlaceDetailResponse } from "../api/client";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";

export function AdminPlaceDetail() {
  const { placeId } = useParams<{ placeId: string }>();
  const queryClient = useQueryClient();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [aliasDraft, setAliasDraft] = useState("");
  const [combineSearch, setCombineSearch] = useState("");
  const combineSearchVersion = useRef(0);
  const [combineHits, setCombineHits] = useState<AdminPlacesListResponse["places"]>([]);
  const [combinePickId, setCombinePickId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: placeId ? queryKeys.admin.locationCleanup.placeDetail(placeId) : ["admin", "location-cleanup", "place", "missing"],
    enabled: Boolean(placeId),
    queryFn: async (): Promise<LocationCleanupPlaceDetailResponse> => {
      const { data, error } = await api.get<LocationCleanupPlaceDetailResponse>(
        `/v1/admin/locations/places/${placeId}`
      );
      if (error || !data) {
        throw new Error(error?.message ?? error?.code ?? "Could not load city.");
      }
      return data;
    },
  });

  const row = detailQuery.data?.place;
  const [previousRow, setPreviousRow] = useState(row);
  if (previousRow !== row) {
    setPreviousRow(row);
    if (row) setRenameDraft(row.displayCity);
  }

  const invalidatePlace = useCallback(() => {
    if (!placeId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.locationCleanup.placeDetail(placeId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.locationCleanup.inbox() });
  }, [placeId, queryClient]);

  const renameMutation = useMutation({
    mutationFn: async () => {
      if (!placeId) return;
      const { error } = await api.post(`/v1/admin/locations/places/${placeId}/rename-display-city`, {
        displayCity: renameDraft.trim(),
      });
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not rename.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      invalidatePlace();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const aliasMutation = useMutation({
    mutationFn: async () => {
      if (!placeId) return;
      const { error } = await api.post(`/v1/admin/locations/places/${placeId}/spelling-alias`, {
        spelling: aliasDraft.trim(),
      });
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not add spelling.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      setAliasDraft("");
      invalidatePlace();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  const combineMutation = useMutation({
    mutationFn: async () => {
      if (!placeId || !combinePickId) return;
      const { error } = await api.post(`/v1/admin/locations/places/${placeId}/combine-with-city`, {
        combineCityId: combinePickId,
      });
      if (error) {
        throw new Error(error.message ?? error.code ?? "Could not combine.");
      }
    },
    onSuccess: () => {
      setBannerError(null);
      setCombinePickId(null);
      combineSearchVersion.current += 1;
      setCombineSearch("");
      setCombineHits([]);
      invalidatePlace();
    },
    onError: (err: Error) => setBannerError(err.message),
  });

  useEffect(() => {
    if (!combineSearch.trim() || combineSearch.trim().length < 2) {
      return;
    }
    let active = true;
    const version = combineSearchVersion.current;
    const handle = window.setTimeout(async () => {
      const q = combineSearch.trim();
      const { data, error } = await api.get<AdminPlacesListResponse>(
        `/v1/admin/places?${new URLSearchParams({ q, limit: "12" }).toString()}`
      );
      if (active && version === combineSearchVersion.current && !error && data) {
        const filtered = data.places.filter((p) => p.id !== placeId);
        setCombineHits(filtered);
      }
    }, 320);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [combineSearch, placeId]);

  const combinePickLabel = useMemo(() => {
    if (!combinePickId) return null;
    const hit = combineHits.find((h) => h.id === combinePickId);
    return hit ? `${hit.city_label}, ${hit.country}` : null;
  }, [combineHits, combinePickId]);

  const navAvatarName = "Admin";

  if (!placeId) {
    return (
      <>
        <Nav variant="home" avatarName={navAvatarName} />
        <div className="home-dashboard location-cleanup-page">
          <p className="body-text">Missing city reference.</p>
        </div>
      </>
    );
  }

  const detail = detailQuery.data;

  return (
    <>
      <Nav variant="home" avatarName={navAvatarName} />
      <div className="home-dashboard location-cleanup-page">
        <div className="location-cleanup-page__inner">
          <header className="location-cleanup-page__header">
            <Link to="/admin/locations/cleanup" className="profile-page__hero-back">
              ← Cleanup inbox
            </Link>
            {detailQuery.isPending ? (
              <h1 className="home-dashboard__hero-title location-cleanup-page__title">Loading…</h1>
            ) : detailQuery.isError || !detail ? (
              <h1 className="home-dashboard__hero-title location-cleanup-page__title">City not found</h1>
            ) : (
              <>
                <h1 className="home-dashboard__hero-title location-cleanup-page__title">
                  {detail.place.displayCity}, {detail.place.displayCountry}
                </h1>
                <p className="body-text location-cleanup-page__lede">
                  {detail.linkedProfiles} profiles list this as their primary city. Spellings below help search understand alternate names.
                </p>
              </>
            )}
          </header>

          {bannerError ? (
            <div className="location-cleanup__banner location-cleanup__banner--error" role="alert">
              {bannerError}
            </div>
          ) : null}

          {!detailQuery.isPending && detail ? (
            <>
              <section className="location-cleanup__section" aria-labelledby="lc-place-spellings">
                <h2 id="lc-place-spellings" className="profile-page__section-title">
                  Alternate spellings
                </h2>
                {detail.aliases.length === 0 ? (
                  <p className="body-text location-cleanup__muted">No extra spellings recorded yet.</p>
                ) : (
                  <ul className="location-cleanup__alias-list">
                    {detail.aliases.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
                <div className="location-cleanup__inline-form">
                  <Input
                    label="Add spelling people might type"
                    value={aliasDraft}
                    onChange={(e) => setAliasDraft(e.target.value)}
                    placeholder="e.g. BLR"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={aliasMutation.isPending || !aliasDraft.trim()}
                    onClick={() => void aliasMutation.mutateAsync()}
                  >
                    Add spelling
                  </Button>
                </div>
              </section>

              <section className="location-cleanup__section" aria-labelledby="lc-place-rename">
                <h2 id="lc-place-rename" className="profile-page__section-title">
                  Rename primary city label
                </h2>
                <p className="body-text location-cleanup__muted">
                  Updates how this city reads across profiles that already point here.
                </p>
                <div className="location-cleanup__inline-form">
                  <Input
                    label="Display city"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      renameMutation.isPending ||
                      !renameDraft.trim() ||
                      renameDraft.trim() === detail.place.displayCity
                    }
                    onClick={() => void renameMutation.mutateAsync()}
                  >
                    Save name
                  </Button>
                </div>
              </section>

              <section className="location-cleanup__section" aria-labelledby="lc-place-merge">
                <h2 id="lc-place-merge" className="profile-page__section-title">
                  Combine another city into this one
                </h2>
                <p className="body-text location-cleanup__muted">
                  Search for the duplicate primary city, pick it, then combine. Profiles and spellings move automatically.
                </p>
                <Input
                  label="Search cities"
                  value={combineSearch}
                  onChange={(e) => {
                    combineSearchVersion.current += 1;
                    setCombineSearch(e.target.value);
                    if (e.target.value.trim().length < 2) setCombineHits([]);
                    setCombinePickId(null);
                  }}
                  placeholder="Type at least two characters"
                  autoComplete="off"
                />
                {combineHits.length > 0 ? (
                  <ul className="location-cleanup__search-hits" role="listbox">
                    {combineHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className={
                            combinePickId === hit.id
                              ? "location-cleanup__search-hit location-cleanup__search-hit--active"
                              : "location-cleanup__search-hit"
                          }
                          onClick={() => setCombinePickId(hit.id)}
                        >
                          <strong>{hit.city_label}</strong>
                          <span className="location-cleanup__muted"> · {hit.country}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="location-cleanup__actions">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={combineMutation.isPending || !combinePickId}
                    onClick={() => void combineMutation.mutateAsync()}
                  >
                    Combine into this city
                  </Button>
                  {combinePickLabel ? (
                    <span className="body-text location-cleanup__muted">Selected: {combinePickLabel}</span>
                  ) : null}
                </div>
              </section>

              <section className="location-cleanup__section" aria-labelledby="lc-place-notes">
                <h2 id="lc-place-notes" className="profile-page__section-title">
                  Recent activity here
                </h2>
                {detail.recentNotes.length === 0 ? (
                  <p className="body-text location-cleanup__muted">Nothing recent yet.</p>
                ) : (
                  <ol className="location-cleanup__audit">
                    {detail.recentNotes.map((item, idx) => (
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
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
