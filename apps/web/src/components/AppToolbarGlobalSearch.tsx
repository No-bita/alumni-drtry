import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cityIntentHrefForPick, resolveGlobalToolbarSearchSubmission } from "../lib/cityIntentFromToolbar";
import { normalizeQ } from "../lib/directorySearchUrlState";
import { HomeToolbarSearch } from "./HomeToolbarSearch";

type ToolbarSearchSyncedProps = {
  committedQ: string;
};

/**
 * Search field state resets when route or committed query identity changes (via parent key).
 */
function ToolbarSearchSynced({ committedQ }: ToolbarSearchSyncedProps) {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState(committedQ);
  const [nudgeActive, setNudgeActive] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightNavSearch = searchParams.get("highlightNavSearch") === "1";

  useEffect(() => {
    if (!highlightNavSearch) return;
    queueMicrotask(() => {
      setNudgeActive(true);
      setFocusSignal((prev) => prev + 1);
      const next = new URLSearchParams(searchParams);
      next.delete("highlightNavSearch");
      setSearchParams(next, { replace: true });
    });
  }, [highlightNavSearch, searchParams, setSearchParams]);

  return (
    <HomeToolbarSearch
      searchText={searchText}
      nudgeActive={nudgeActive}
      focusSignal={focusSignal}
      onSearchTextChange={(value) => {
        if (nudgeActive) setNudgeActive(false);
        setSearchText(value);
      }}
      onSubmitSearch={() => {
        if (nudgeActive) setNudgeActive(false);
        const routed = resolveGlobalToolbarSearchSubmission(searchText);
        if (routed.kind === "empty") {
          navigate("/search");
          return;
        }
        if (routed.kind === "city-hub") {
          navigate(cityIntentHrefForPick(routed.pick));
          setSearchText("");
          return;
        }
        navigate(`/search?q=${encodeURIComponent(routed.q)}`);
      }}
    />
  );
}

/**
 * Directory quick-search in the fixed app toolbar (intent sidebar shell).
 * On `/search` the field mirrors `q`.
 * `@…` → always `/intent/location/:slug`. Bare catalog city → hub. Otherwise `/search?q=…`.
 */
export function AppToolbarGlobalSearch() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const committedQ = normalizeQ(searchParams.get("q") ?? "");
  const syncKey =
    location.pathname === "/search" ? `/search:${committedQ}` : location.pathname;
  const committedForField = location.pathname === "/search" ? committedQ : "";

  return <ToolbarSearchSynced key={syncKey} committedQ={committedForField} />;
}
