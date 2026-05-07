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
  oneLinePitch?: string;
  stage?: "idea" | "prototype" | "launched" | "scaling";
  domain?: string;
  supportNeeded?: string[];
  location?: string;
  posterName: string;
  posterCompany?: string;
  posterProfileId?: string;
  actions?: BuildPostCardAction[];
};

export function BuildPostCard({
  title,
  industry,
  description,
  oneLinePitch,
  stage,
  domain,
  supportNeeded = [],
  location,
  posterName,
  posterCompany,
  posterProfileId,
  actions = [],
}: BuildPostCardProps) {
  return (
    <article className="build-post-card">
      <div className="build-post-card__content">
        <h3 className="build-post-card__title">{title}</h3>
        {oneLinePitch ? <p className="build-post-card__pitch">{oneLinePitch}</p> : null}
        <div className="build-post-card__chips">
          {stage ? <p className="build-post-card__industry">{stage}</p> : null}
          {domain ? <p className="build-post-card__industry build-post-card__industry--domain">{domain}</p> : null}
          {!stage && industry ? <p className="build-post-card__industry">{industry}</p> : null}
          {location ? <p className="build-post-card__industry build-post-card__industry--meta">{location}</p> : null}
        </div>
        <p className="build-post-card__description body-text">{description}</p>
        {supportNeeded.length > 0 ? (
          <div className="build-post-card__support">
            {supportNeeded.map((support) => (
              <span key={support} className="build-post-card__support-chip">
                {support}
              </span>
            ))}
          </div>
        ) : null}
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
              <Avatar name={posterName} size="sm" tone="pastel" />
              <div className="build-post-card__poster-text">
                <p className="build-post-card__poster-name">{posterName}</p>
                {posterCompany ? <p className="build-post-card__poster-company">{posterCompany}</p> : null}
              </div>
            </div>
          </Link>
        ) : (
          <div className="build-post-card__poster">
            <Avatar name={posterName} size="sm" tone="pastel" />
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
