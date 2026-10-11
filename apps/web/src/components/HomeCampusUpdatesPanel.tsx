import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { API_BASE_URL, type CampusMonthlyCurrentResponse } from "../api/client";
import { IconFile } from "./HomeIcons";

const FALLBACK_PDF = encodeURI("/media/Alma Communique Feb 2026.pdf");

export function HomeCampusUpdatesPanel() {
  const digestQuery = useQuery({
    queryKey: queryKeys.home.campusMonthly(),
    queryFn: ({ signal }) => assertApiGet<CampusMonthlyCurrentResponse>("/v1/campus-monthly/current", signal),
  });

  const pdfUrl = useMemo(() => {
    if (digestQuery.data?.issue) return `${API_BASE_URL}/v1/campus-monthly/current/pdf`;
    return FALLBACK_PDF;
  }, [digestQuery.data]);

  const liveIssue = digestQuery.data?.issue ?? null;
  const title = liveIssue?.headingLabel ?? "Alma Communique - Feb 2026";
  const blurb = digestQuery.isPending
    ? "Checking for the newest edition."
    : digestQuery.isError
      ? "We couldn't check for a newer edition just now. This one is the latest we have on file."
      : liveIssue
        ? "Hot off the press. Grab a chai and read it."
        : "No current edition is available. Read the February 2026 edition.";

  return (
    <section className="home-ideal__panel" aria-labelledby="home-campus-updates-heading">
      <header className="home-ideal__campus-header">
        <span className="home-ideal__campus-header-icon" aria-hidden>
          <IconFile className="home-ideal__campus-header-icon-svg" />
        </span>
        <h2 id="home-campus-updates-heading" className="home-ideal__panel-title">
          Campus Updates
        </h2>
      </header>
      <article className="home-ideal__campus-card">
        <div className="home-ideal__campus-cover" aria-hidden>
          <span className="home-ideal__campus-cover-brand">IIT BHU</span>
          <span className="home-ideal__campus-cover-title">Alma Communique</span>
          <span className="home-ideal__campus-cover-seal">1916</span>
        </div>
        <div className="home-ideal__campus-body">
          <p className="home-ideal__campus-title">{title.replace(" - ", " - ")}</p>
          <p className="home-ideal__campus-copy">{blurb}</p>
          <p className="home-ideal__campus-meta">
            <IconFile className="home-ideal__campus-meta-icon" />
            <span>PDF</span>
          </p>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="home-ideal__campus-view-btn">
            View PDF
          </a>
        </div>
      </article>
    </section>
  );
}
