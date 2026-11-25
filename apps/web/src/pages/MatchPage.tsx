import { Navigate, useLocation } from "react-router-dom";
import { askParamsFromMatch } from "../lib/matchApi";

/** `/match` is gone as a page: old links (Careers, Business, WhatsApp, bookmarks) land on Ask mode of `/search`. */
export function MatchPage() {
  const { search } = useLocation();
  return <Navigate to={`/search?${askParamsFromMatch(new URLSearchParams(search)).toString()}`} replace />;
}
