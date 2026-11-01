import { useLayoutEffect } from "react";

export function StagingMarker() {
  const enabled = typeof __ALMA_STAGING__ !== "undefined" && __ALMA_STAGING__ === true;
  useLayoutEffect(() => {
    if (!enabled) return;
    const previousTitle = document.title;
    document.documentElement.dataset.almaEnvironment = "staging";
    document.title = `[STAGING] ${previousTitle}`;
    return () => {
      delete document.documentElement.dataset.almaEnvironment;
      document.title = previousTitle;
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div className="staging-marker" role="note" aria-label="Staging environment. Test data.">STAGING · Test data</div>;
}
