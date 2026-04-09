import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Link } from "react-router-dom";

export type BuildPostCardAction = {
  label: string;
  onClick?: () => void;
};

export type BuildPostCardProps = {
  title: string;
  industry?: string;
  description: string;
  posterName: string;
  posterCompany?: string;
  posterProfileId?: string;
  posterDepartmentCode?: string | null;
  actions?: BuildPostCardAction[];
};

export function BuildPostCard({
  title,
  industry,
  description,
  posterName,
  posterCompany,
  posterProfileId,
  posterDepartmentCode,
  actions = [],
}: BuildPostCardProps) {
  return (
    <article className="build-post-card">
      <div className="build-post-card__content">
        <h3 className="build-post-card__title">{title}</h3>
        {industry ? <p className="build-post-card__industry">{industry}</p> : null}
        <p className="build-post-card__description body-text">{description}</p>
        {actions.length > 0 ? (
          <div className="build-post-card__actions">
            {actions.map((a, i) => (
              <Button key={`${a.label}-${i}`} type="button" variant="secondary" onClick={a.onClick}>
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="build-post-card__top">
        {posterProfileId ? (
          <Link
            to={`/profiles/${posterProfileId}`}
            className="build-post-card__poster-link"
            aria-label={`View ${posterName}'s profile`}
          >
            <div className="build-post-card__poster">
              <Avatar name={posterName} size="sm" tone="pastel" departmentCode={posterDepartmentCode} />
              <div className="build-post-card__poster-text">
                <p className="build-post-card__poster-name">{posterName}</p>
                {posterCompany ? <p className="build-post-card__poster-company">{posterCompany}</p> : null}
              </div>
            </div>
          </Link>
        ) : (
          <div className="build-post-card__poster">
            <Avatar name={posterName} size="sm" tone="pastel" departmentCode={posterDepartmentCode} />
            <div className="build-post-card__poster-text">
              <p className="build-post-card__poster-name">{posterName}</p>
              {posterCompany ? <p className="build-post-card__poster-company">{posterCompany}</p> : null}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
