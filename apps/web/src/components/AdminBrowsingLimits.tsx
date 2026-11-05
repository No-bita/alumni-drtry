import { useQuery } from "@tanstack/react-query";
import { browsingLimitsQueryKey, fetchBrowsingLimits } from "../lib/browsingLimits";

/** Analytics: members close to today's browsing cap (anti-scraping watch). Counts only, never names. */
export function AdminBrowsingLimits() {
  const q = useQuery({
    queryKey: browsingLimitsQueryKey,
    queryFn: ({ signal }) => fetchBrowsingLimits(signal),
    staleTime: 60_000,
  });
  return (
    <section className="aa-section" aria-labelledby="aa-limits-title">
      <div className="aa-section__head">
        <h2 id="aa-limits-title" className="aa-section__title">
          Browsing limits
        </h2>
        <p className="aa-section__note">
          {q.data && q.data.cap > 0
            ? `Each member can open up to ${q.data.cap} profiles, searches and people lists a day (midnight India time). Admins aren't counted.`
            : "Members' daily browsing is limited to stop copying of the directory."}
        </p>
      </div>
      {q.isPending ? (
        <p className="aa-message" role="status">
          Loading…
        </p>
      ) : q.isError || !q.data ? (
        <p className="aa-message" role="alert">
          Couldn&apos;t load browsing limits.{" "}
          <button type="button" className="aa-refresh" onClick={() => void q.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="aa-tiles">
          <div className="aa-tile">
            <p className="aa-tile__label">Members near today&apos;s browsing limit (≥80%)</p>
            <p className="aa-tile__value">{q.data.nearLimit}</p>
            <p className="aa-tile__hint">Counted only. A high number can mean someone is copying the directory.</p>
          </div>
          <div className="aa-tile">
            <p className="aa-tile__label">Members at the limit today</p>
            <p className="aa-tile__value">{q.data.atLimit}</p>
            <p className="aa-tile__hint">They see &ldquo;Try again tomorrow&rdquo; until midnight India time.</p>
          </div>
        </div>
      )}
    </section>
  );
}
