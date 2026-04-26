import { Link } from "react-router-dom";
import type { BuildProject } from "../../lib/buildShowcase";
import { BuildSupportActions } from "./BuildSupportActions";

type BuildProjectDetailPanelProps = {
  project: BuildProject | null;
  onClose: () => void;
  onSignalSupport: (project: BuildProject, kind: "mentorship" | "clients" | "funding") => Promise<void>;
  onConnect: (project: BuildProject) => Promise<void>;
};

export function BuildProjectDetailPanel({
  project,
  onClose,
  onSignalSupport,
  onConnect,
}: BuildProjectDetailPanelProps) {
  if (!project) return null;

  return (
    <aside className="build-project-detail" aria-label="Project details">
      <div className="build-project-detail__header">
        <p className="build-project-detail__kicker">Project details</p>
        <button type="button" className="build-project-detail__close" onClick={onClose} aria-label="Close details">
          Close
        </button>
      </div>
      <h3 className="build-project-detail__title">{project.title}</h3>
      {project.oneLinePitch ? <p className="build-project-detail__pitch">{project.oneLinePitch}</p> : null}
      <p className="build-project-detail__meta">
        {project.stage ? `${project.stage} · ` : ""}
        {project.domain}
        {project.location ? ` · ${project.location}` : ""}
      </p>
      <p className="build-project-detail__description">{project.description}</p>
      {project.askDetails ? (
        <div className="build-project-detail__ask">
          <p className="build-project-detail__label">Current ask</p>
          <p>{project.askDetails}</p>
        </div>
      ) : null}
      {project.links.length > 0 ? (
        <div className="build-project-detail__links">
          <p className="build-project-detail__label">Links</p>
          <ul>
            {project.links.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="build-project-detail__builder">
        <p className="build-project-detail__label">Builder</p>
        <Link to={`/profiles/${project.authorPersonId}`} className="build-project-detail__builder-link">
          {project.authorName}
          {project.authorCompany ? ` · ${project.authorCompany}` : ""}
        </Link>
      </div>
      <BuildSupportActions
        disabled={project.viewerHasResponded}
        onSignal={(kind) => onSignalSupport(project, kind)}
        onConnect={() => onConnect(project)}
      />
    </aside>
  );
}
