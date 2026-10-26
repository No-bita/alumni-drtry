import { useQuery } from "@tanstack/react-query";
import { fetchHomeSummary, HOME_SUMMARY_QUERY_KEY, reassuranceLine } from "../lib/homeSummary";

/** Under the ask: real counts of who can help. Hidden while loading, on error, or when it would say 0. */
export function HomeReassurance() {
  const query = useQuery({
    queryKey: HOME_SUMMARY_QUERY_KEY,
    queryFn: ({ signal }) => fetchHomeSummary(signal),
    staleTime: 10 * 60 * 1000,
  });
  const line = query.data ? reassuranceLine(query.data) : null;
  if (!line) return null;
  return <p className="home-reassurance">{line}</p>;
}
