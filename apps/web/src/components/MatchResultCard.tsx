import { Link } from "react-router-dom";
import type { MatchResult } from "../lib/matchApi";
import { OPEN_TO_CATALOG } from "../lib/openToPreferences";
import { replyStatsLine } from "../lib/sentNotes";
import { Avatar } from "./Avatar";
import { DeptBatchMeta } from "./DeptBatchMeta";

type MatchResultCardProps = {
  result: MatchResult;
  onReachOut: (result: MatchResult) => void;
};

function headline(result: MatchResult): string | null {
  const role = result.headlineRoleTitle?.trim();
  const org = result.headlineOrganizationName?.trim();
  if (role && org) return `${role} · ${org}`;
  return role || org || null;
}

export function MatchResultCard({ result, onReachOut }: MatchResultCardProps) {
  const line = headline(result);
  const profileHref = `/profiles/${result.id}`;
  return (
    <li className="match-card">
      <div className="match-card__head">
        <Avatar name={result.fullName} size="md" />
        <div className="match-card__identity">
          <Link to={profileHref} className="match-card__name">
            {result.fullName}
          </Link>
          <DeptBatchMeta departmentCode={result.departmentCode} batchYear={result.batchYear} className="match-card__meta" />
          {line ? <p className="match-card__headline">{line}</p> : null}
          {result.replyStats ? <p className="match-card__reply-stats">{replyStatsLine(result.replyStats)}</p> : null}
        </div>
      </div>

      <div className="match-card__why">
        <p className="match-card__why-label">Why them</p>
        <ul className="match-card__reasons">
          {result.reasons.slice(0, 3).map((r) => (
            <li key={`${r.key}-${r.text}`}>{r.text}</li>
          ))}
        </ul>
      </div>

      {result.openTo.length > 0 ? (
        <ul className="match-card__tags" aria-label="Open to">
          {result.openTo.map((id) => (
            <li
              key={id}
              className={`match-card__tag${result.relevantOpenTo.includes(id) ? " match-card__tag--relevant" : ""}`}
            >
              {OPEN_TO_CATALOG[id].title}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="match-card__actions">
        {result.yourNote === "pending" ? (
          <p className="match-card__note-status" role="status">
            Note sent · waiting for reply · <Link to="/notifications">See your notes</Link>
          </p>
        ) : result.yourNote === "accepted" ? (
          <p className="match-card__note-status match-card__note-status--accepted" role="status">
            Accepted your note · <Link to="/notifications">See their contact</Link>
          </p>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => onReachOut(result)}>
            Reach out
          </button>
        )}
        <Link to={profileHref} className="match-card__profile-link">
          View profile
        </Link>
      </div>
    </li>
  );
}
