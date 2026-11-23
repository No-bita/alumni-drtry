import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type SearchProfileView } from "../api/client";
import { matchReasonLabel } from "../lib/matchReasonLabels";
import { Avatar } from "./Avatar";
import { DeptBatchMeta } from "./DeptBatchMeta";

/** Where the viewer's reachout to this member stands, once looked up or sent (null: not known or none open). */
export type SearchCardNote = "pending" | "accepted" | null;

type SearchResultRowProps = {
  profile: SearchProfileView;
  /** Kept by the page, so it survives the card scrolling out of the virtual list. */
  note: SearchCardNote;
  /** The lookup found an open or accepted reachout. */
  onNote: (personId: string, note: Exclude<SearchCardNote, null>) => void;
  /** No open reachout: the page opens the note form. */
  onReachOut: (profile: SearchProfileView) => void;
  style?: React.CSSProperties;
  /** Zero-based position in the current merged result list (kept for search analytics, not used yet). */
  resultIndex: number;
  /** Kept for search analytics, not used yet. */
  searchSessionId?: string | null;
};

/** At most this many "why this matched" pills. */
const MATCH_PILLS_MAX = 3;

/**
 * Directory result card (layout A): name, institute and class, role at company, why they matched,
 * then Reach out and View profile. Reach out checks where an earlier reachout stands only when tapped.
 */
export function SearchResultRow({ profile, note, onNote, onReachOut, style }: SearchResultRowProps) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = (profile.fullName ?? "").trim() || "Alum";
  const profileHref = `/profiles/${profile.id}`;
  const deptCode = profile.departmentCode?.trim() ? profile.departmentCode : null;
  const batch = typeof profile.batchYear === "number" && Number.isFinite(profile.batchYear) ? profile.batchYear : null;
  const institute = profile.institutionName?.trim() || null;
  const role = profile.headlineRoleTitle?.trim() || null;
  const org = profile.headlineOrganizationName?.trim() || null;
  const roleLine = role && org ? `${role} · ${org}` : role || org;
  // Different keys can share a label ("exact_name" and "name_match" are both "Name match").
  const reasons = [...new Set((profile.matchReasons ?? []).map(matchReasonLabel))].slice(0, MATCH_PILLS_MAX);

  const reachOut = async () => {
    if (checking) return;
    setChecking(true);
    setError(null);
    const { data, error: err } = await api.get<{ yourNote: "pending" | "accepted" | "declined" | null }>(
      `/v1/contact-requests/status?recipientPersonId=${encodeURIComponent(profile.id)}`,
    );
    setChecking(false);
    if (err) {
      setError("Couldn't check your reachouts. Try again.");
      return;
    }
    if (data?.yourNote === "pending" || data?.yourNote === "accepted") {
      onNote(profile.id, data.yourNote);
      return;
    }
    onReachOut(profile);
  };

  return (
    <article className="search-card fade-up" style={style} aria-label={name}>
      <div className="search-card__who">
        <Avatar name={name} size="sm" tone="pastel" />
        <div className="search-card__text">
          <h3 className="search-card__name">
            <Link to={profileHref}>{name}</Link>
          </h3>
          {institute || deptCode || batch ? (
            <span className="search-card__context">
              {institute ? <span>{institute}</span> : null}
              {institute && (deptCode || batch) ? <span aria-hidden="true">·</span> : null}
              {deptCode || batch ? <DeptBatchMeta className="dept-batch-meta" departmentCode={deptCode} batchYear={batch} /> : null}
            </span>
          ) : null}
          {roleLine ? <p className="search-card__role">{roleLine}</p> : null}
        </div>
      </div>

      {reasons.length > 0 ? (
        <ul className="search-card__pills" aria-label="Why this profile matched">
          {reasons.map((label) => (
            <li key={label} className="search-card__pill">
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="search-card__actions">
        {note === "pending" ? (
          <p className="search-card__status" role="status">
            Reachout sent · waiting for reply · <Link to="/notifications">See your reachouts</Link>
          </p>
        ) : note === "accepted" ? (
          <p className="search-card__status" role="status">
            Accepted your reachout · <Link to="/notifications">See their contact</Link>
          </p>
        ) : (
          <button type="button" className="search-card__reach" disabled={checking} onClick={() => void reachOut()}>
            {checking ? "Checking…" : "Reach out"}
          </button>
        )}
        <Link to={profileHref} className="search-card__view" aria-label={`View ${name}'s profile`}>
          View profile
        </Link>
        {error ? (
          <p className="search-card__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}
