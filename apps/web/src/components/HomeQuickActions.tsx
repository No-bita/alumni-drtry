import "../styles/home-nudge.css";
import { Link } from "react-router-dom";
import {
  IconArrowUpRight,
  IconBriefcase,
  IconCity,
  IconHammer,
  IconMegaphone,
  IconUsers,
} from "./HomeIcons";

type HomeQuickActionBase = {
  id: string;
  title: string;
  description?: string;
};

/** Navigation card — default quick actions */
export type HomeQuickActionLink = HomeQuickActionBase & {
  href: string;
  onActivate?: undefined;
};

/** Button card — wire `open()` from flows (bulletin, hiring, etc.) */
export type HomeQuickActionTrigger = HomeQuickActionBase & {
  onActivate: () => void;
  href?: undefined;
};

export type HomeQuickAction = HomeQuickActionLink | HomeQuickActionTrigger;

function renderQuickActionIcon(id: string) {
  if (id === "referrals") return <IconBriefcase className="home-ideal__quick-action-svg" />;
  if (id === "collaborators") return <IconHammer className="home-ideal__quick-action-svg" />;
  if (id === "directory") return <IconUsers className="home-ideal__quick-action-svg" />;
  if (id === "bulletin") return <IconMegaphone className="home-ideal__quick-action-svg" />;
  return <IconCity className="home-ideal__quick-action-svg" />;
}

type HomeQuickActionCardsProps = {
  actions: HomeQuickAction[];
  /** When set, cards sit inside the intent hero (same surface as headline). */
  variant?: "page" | "intentHero";
  /** Optional action id to gently animate as a CTA nudge. */
  nudgeActionId?: string;
};

export function HomeQuickActionCards({ actions, variant = "page", nudgeActionId }: HomeQuickActionCardsProps) {
  const navClass =
    variant === "intentHero"
      ? "home-ideal__quick-actions home-ideal__quick-actions--intent-hero"
      : "home-ideal__quick-actions";

  return (
    <nav className={navClass} aria-label="Quick ways to get started">
      {actions.map((action) => {
        const shouldNudge = nudgeActionId != null && action.id === nudgeActionId;
        const cardClass = `home-ideal__quick-action-card home-ideal__quick-action-card--${action.id}${shouldNudge ? " home-ideal__quick-action-card--nudge" : ""}`;
        const iconWrap = (
          <>
            <span
              className={`home-ideal__quick-action-icon home-ideal__quick-action-icon--${action.id}`}
              aria-hidden
            >
              {renderQuickActionIcon(action.id)}
            </span>
            {"onActivate" in action ? null : (
              <span className="home-ideal__quick-action-external" aria-hidden>
                <IconArrowUpRight className="home-ideal__quick-action-external-svg" />
              </span>
            )}
          </>
        );
        const body = (
          <span className="home-ideal__quick-action-body">
            <span className="home-ideal__quick-action-title">{action.title}</span>
            {action.description ? <span className="home-ideal__quick-action-copy">{action.description}</span> : null}
          </span>
        );

        if ("onActivate" in action) {
          return (
            <button key={action.id} type="button" className={cardClass} onClick={action.onActivate}>
              <div className="home-ideal__quick-action-card-top">{iconWrap}</div>
              {body}
            </button>
          );
        }

        return (
          <Link key={action.id} to={action.href} className={cardClass}>
            <div className="home-ideal__quick-action-card-top">{iconWrap}</div>
            {body}
          </Link>
        );
      })}
    </nav>
  );
}

type HomeQuickActionsProps = {
  actions: HomeQuickAction[];
};

/** Standalone quick-action strip (outside the hero). Prefer `intentHero` on `/home`. */
export function HomeQuickActions({ actions }: HomeQuickActionsProps) {
  return (
    <section className="home-ideal__quick-actions-section" aria-label="Quick actions">
      <HomeQuickActionCards actions={actions} variant="page" />
    </section>
  );
}
