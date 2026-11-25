import { JOB_FUNCTION_LABELS, type JobFunction } from "../../lib/jobFunctions";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { OccupationView, ProfileLinkView, ProfileResponse, PublicProfileView } from "../../api/client";
import { publicAsset } from "../../lib/appBase";
// Paused with the "Open to" card below: OPEN_TO_CATALOG, coffeeLimitOf.
import { type OpenToPreferences } from "../../lib/openToPreferences";
import {
  CAREER_PHOTO_MAX_ROLES,
  displayLinkText,
  headlineInstituteLine,
  headlineRole,
  headlineRoleLine,
  instituteEducation,
  setupSteps,
  splitCareerAndEducation,
  type ProfileSection,
} from "../../lib/profilePage";
import { formatOccupationCompanyTypeLine, formatOccupationDatesDurationLine, residenceLine } from "../../lib/profileDisplay";
import { isXProfileLink } from "../../lib/profileLinkRules";
import { linkToSocialPlatformKey } from "../../lib/socialLinks";
import { safeWebHref } from "../../lib/webUrl";
// Paused with the "Open to" card: import { OpenToIcon } from "./OpenToIcon";
import "../../styles/profile-page.css";

const CAREER_PHOTO = publicAsset("login-hero-house-portrait.jpg");

type IconName = "institute" | "work" | "pin" | "areas" | "education" | "career" | "open" | "links" | "lock" | "edit" | "more" | "external" | "send" | "check" | "github" | "linkedin" | "x" | "globe";

const ICON_PATHS: Record<IconName, ReactNode> = {
  institute: <path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3l9-5Z" />,
  work: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12.5h18" />
    </>
  ),
  pin: <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21ZM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0" />,
  areas: <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14Zm0 0 7-7" />,
  education: <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9ZM6.5 11v4.5c1.4 1.4 3.3 2 5.5 2s4.1-.6 5.5-2V11" />,
  career: <path d="M3 18 9 12l4 4 8-9M15 7h6v6" />,
  open: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.5a3 3 0 0 1 0 5.6M18.5 14.5c1.6.6 2.6 2.1 2.9 4.5" />
    </>
  ),
  links: <path d="M10 14l4-4M8 15l-2 2a4 4 0 0 0 6 5l3-3M16 9l2-2a4 4 0 0 0-6-5L9 5" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  edit: <path d="M16 3l5 5-12 12-6 1 1-6ZM13 6l5 5" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  send: <path d="M4 12 20 4l-6 16-3-7-7-1Z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  github: <path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M8 10.5V17M8 7.5v.01M12 17v-6.5M12 13.5c0-2 1.2-3 2.6-3 1.5 0 2.4 1 2.4 3V17" />
    </>
  ),
  x: <path d="M4 4l16 16M20 4 4 20" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </>
  ),
};

function Icon({ name, className = "pp-icon" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

type Props = {
  profile: PublicProfileView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
  areas: string[];
  openTo: OpenToPreferences | null;
  yourNote: ProfileResponse["yourNote"];
  isOwnProfile: boolean;
  onboardingIncomplete: boolean;
  privateContact?: { personalEmail?: string | null; mobilePhone?: string | null };
  /** Owner-only notices placed above the sections (e.g. a company that wasn't accepted). */
  ownerNotice?: ReactNode;
  /** Owner-only cards under Contact (e.g. WhatsApp notes). */
  ownerExtras?: ReactNode;
  /** Owner only: the member's job function (undefined when the API doesn't send it). */
  jobFunction?: JobFunction | null;
  onEdit: (section: ProfileSection) => void;
  onReachOut: () => void;
  onSignOut: () => void;
  /** Sign out of all devices. Rejects with a message when the server refused. */
  onSignOutEverywhere?: () => Promise<void>;
};

/**
 * One-page profile: everything a visitor needs is visible without a click. The header answers who
 * this is; areas, career and education whether they can help; "open to" whether they'll welcome it.
 */
export function ProfilePageView(props: Props) {
  const { profile, occupations, links, areas, openTo, isOwnProfile: owner, onEdit } = props;
  const roleLine = headlineRoleLine(headlineRole(occupations));
  const instituteLine = headlineInstituteLine(profile);
  const city = residenceLine(profile.residenceCity, profile.residenceCountry);
  const { career, education } = splitCareerAndEducation(occupations);
  const institute = instituteEducation(profile, owner);
  const visibleLinks = links.filter((l) => !isXProfileLink(l) && safeWebHref(l.url));
  // Paused with the "Open to" card: const openItems = openTo?.selected ?? [];
  const steps = owner ? setupSteps({ occupations, areas, openTo, jobFunction: props.jobFunction }) : [];
  const showSetup = owner && steps.some((s) => !s.done);

  const pencil = (section: ProfileSection, label: string) =>
    owner ? (
      <button type="button" className="pp-pencil" aria-label={label} onClick={() => onEdit(section)}>
        <Icon name="edit" />
      </button>
    ) : null;

  const cardHead = (icon: IconName, title: string, section: ProfileSection, label: string) => (
    <div className="pp-card__head">
      <Icon name={icon} className="pp-card__icon" />
      <h2 className="pp-card__title">{title}</h2>
      {pencil(section, label)}
    </div>
  );

  const areasCard =
    areas.length > 0 || owner ? (
      <section className="pp-card pp-o-areas" aria-label="Areas of experience">
        {cardHead("areas", "Areas of experience", "areas", "Edit areas of experience")}
        {areas.length ? (
          <ul className="pp-chips">
            {areas.map((a) => (
              <li key={a} className="pp-chip">
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pp-empty">What people can ask you about. Ask uses these to find you.</p>
        )}
      </section>
    ) : null;

  const educationCard =
    institute || education.length > 0 ? (
      <section className="pp-card pp-o-education" aria-label="Education">
        {cardHead("education", "Education", "education", "Edit education")}
        <ul className="pp-edu">
          {institute ? (
            <li>
              {institute.institution ? <strong className="pp-edu__school">{institute.institution}</strong> : null}
              {institute.program ? <span className="pp-edu__program">{institute.program}</span> : null}
              {institute.years ? <small className="pp-edu__years">{institute.years}</small> : null}
            </li>
          ) : null}
          {education.map((e) => (
            <li key={e.id}>
              {e.organizationName ? <strong className="pp-edu__school">{e.organizationName}</strong> : null}
              <span className="pp-edu__program">{e.roleTitle}</span>
              {formatOccupationDatesDurationLine(e) ? <small className="pp-edu__years">{formatOccupationDatesDurationLine(e)}</small> : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const linksCard =
    visibleLinks.length > 0 || owner ? (
      <section className="pp-card pp-o-links" aria-label="Links">
        {cardHead("links", "Links", "links", "Edit links")}
        {visibleLinks.length ? (
          <ul className="pp-links">
            {visibleLinks.map((l) => {
              const key = linkToSocialPlatformKey(l);
              const icon: IconName = key === "github" ? "github" : key === "linkedin" ? "linkedin" : "globe";
              return (
                <li key={l.id}>
                  <a href={safeWebHref(l.url)!} target="_blank" rel="noopener noreferrer" className="pp-link">
                    <Icon name={icon} />
                    <span className="pp-link__text">{displayLinkText(l.url)}</span>
                    <Icon name="external" className="pp-icon pp-link__ext" />
                    <span className="pp-visually-hidden"> ({l.label || l.platform}, opens in a new tab)</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pp-empty">Add LinkedIn, GitHub or your portfolio website.</p>
        )}
      </section>
    ) : null;

  const careerCard =
    career.length > 0 || owner ? (
      <section className={`pp-card pp-card--career pp-o-career${career.length > 0 && career.length <= CAREER_PHOTO_MAX_ROLES ? " pp-card--photo" : ""}`} aria-label="Career history">
        {cardHead("career", "Career history", "career", "Edit career history")}
        {owner && props.jobFunction !== undefined ? (
          <p className="pp-function">
            <span>Function (only you see this): {props.jobFunction ? JOB_FUNCTION_LABELS[props.jobFunction] : "not set"}</span>
            <button type="button" className="pp-inline-link" onClick={() => onEdit("function")}>
              {props.jobFunction ? "Change" : "Add"}
            </button>
          </p>
        ) : null}
        {career.length ? (
          <ol className="pp-timeline">
            {career.map((o) => (
              <li key={o.id} className={o.isCurrent ? "pp-timeline__now" : undefined}>
                <h3 className="pp-timeline__role">{o.roleTitle}</h3>
                {formatOccupationCompanyTypeLine(o) ? <p className="pp-timeline__org">{formatOccupationCompanyTypeLine(o)}</p> : null}
                {formatOccupationDatesDurationLine(o) ? <p className="pp-timeline__when">{formatOccupationDatesDurationLine(o)}</p> : null}
                {o.description?.trim() ? <p className="pp-timeline__desc">{o.description}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="pp-empty">Add your current role so people know what you do.</p>
        )}
        {career.length > 0 && career.length <= CAREER_PHOTO_MAX_ROLES ? (
          <div className="pp-card__photo" style={{ backgroundImage: `url("${CAREER_PHOTO}")` }} aria-hidden="true" />
        ) : null}
      </section>
    ) : null;

  /* "Open to helping with" is paused for now; re-introduce later by uncommenting this block and its render below.
  const coffee = coffeeLimitOf(openTo);
  const openCard =
    openItems.length > 0 || owner ? (
      <section className="pp-card pp-card--open pp-o-open" aria-label="Open to helping with">
        {cardHead("open", "Open to helping with", "openTo", "Edit open to")}
        {openItems.length ? (
          <ul className="pp-pills">
            {openItems.map((id) => (
              <li key={id} className="pp-pill">
                <OpenToIcon kind={id} className="pp-pill__icon" />
                <span>
                  {OPEN_TO_CATALOG[id].title}
                  {id === "coffee" && coffee ? <span className="pp-pill__note"> · {coffee} a week</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pp-empty">Say how you're happy to help: referrals, mentorship, coffee chats and more.</p>
        )}
      </section>
    ) : null;
  */

  const contactCard = owner ? (
    <section className="pp-card pp-o-contact" aria-label="Contact">
      {cardHead("lock", "Contact", "contact", "Edit contact details")}
      <p className="pp-contact__note">Only you can see this. Shared only when you accept someone's reachout.</p>
      <dl className="pp-contact">
        <div>
          <dt>Personal email</dt>
          <dd>{props.privateContact?.personalEmail || "Not added"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{props.privateContact?.mobilePhone || "Not added"}</dd>
        </div>
      </dl>
    </section>
  ) : null;

  return (
    <section className="pp" aria-label={`${profile.fullName}'s profile`}>
      <header className="pp-head">
        <div className="pp-head__main">
          <h1 className="pp-head__name">{profile.fullName}</h1>
          <ul className="pp-head__facts">
            {instituteLine ? (
              <li>
                <Icon name="institute" />
                <span>{instituteLine}</span>
              </li>
            ) : null}
            {roleLine ? (
              <li>
                <Icon name="work" />
                <span>{roleLine}</span>
              </li>
            ) : null}
            {city ? (
              <li>
                <Icon name="pin" />
                <span>{city}</span>
              </li>
            ) : null}
          </ul>
          {owner && props.onboardingIncomplete ? (
            <Link to="/onboarding" className="pp-head__finish">
              Finish onboarding
            </Link>
          ) : null}
        </div>
        <div className="pp-head__actions">
          {owner ? (
            <button type="button" className="pp-icon-btn" aria-label="Edit where you live" onClick={() => onEdit("header")}>
              <Icon name="edit" />
            </button>
          ) : (
            <ReachOutControl yourNote={props.yourNote} onReachOut={props.onReachOut} />
          )}
          <MoreMenu owner={owner} name={profile.fullName} onSignOut={props.onSignOut} onSignOutEverywhere={props.onSignOutEverywhere} />
        </div>
      </header>

      {showSetup ? (
        <section className="pp-setup" aria-label="Finish your profile">
          <div className="pp-setup__head">
            <h2>Finish your profile</h2>
            <span>
              {steps.filter((s) => s.done).length} of {steps.length} done
            </span>
          </div>
          <ol className="pp-setup__steps">
            {steps.map((s, i) => (
              <li key={s.key} className={s.done ? "pp-setup__step--done" : undefined}>
                <span className="pp-setup__n" aria-hidden="true">
                  {s.done ? <Icon name="check" /> : i + 1}
                </span>
                <span className="pp-setup__label">
                  {s.label}
                  {s.done ? <span className="pp-visually-hidden"> (done)</span> : null}
                </span>
                {!s.done ? (
                  <button type="button" className="pp-inline-link" onClick={() => onEdit(s.section)}>
                    Add
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {props.ownerNotice}

      <div className="pp-cols">
        <div className="pp-col pp-col--left">
          {areasCard}
          {educationCard}
          {linksCard}
        </div>
        <div className="pp-col pp-col--mid">{careerCard}</div>
        <div className="pp-col pp-col--right">
          {/* "Open to helping with" is paused for now; re-enable by restoring {openCard} here. */}
          {contactCard}
          {owner && props.ownerExtras ? <div className="pp-o-extras">{props.ownerExtras}</div> : null}
        </div>
      </div>
    </section>
  );
}

/** Reach out, or where an earlier reachout stands (as on Ask). */
function ReachOutControl({ yourNote, onReachOut }: { yourNote: ProfileResponse["yourNote"]; onReachOut: () => void }) {
  if (yourNote === "pending") {
    return (
      <p className="pp-reach pp-reach--status" role="status">
        <Icon name="check" />
        <span>
          Reachout sent · waiting for reply · <Link to="/notifications">See your reachouts</Link>
        </span>
      </p>
    );
  }
  if (yourNote === "accepted") {
    return (
      <p className="pp-reach pp-reach--status pp-reach--accepted" role="status">
        <Icon name="check" />
        <span>
          Accepted your reachout · <Link to="/notifications">See their contact</Link>
        </span>
      </p>
    );
  }
  return (
    <button type="button" className="pp-reach pp-reach--btn" onClick={onReachOut}>
      <Icon name="send" />
      Reach out
    </button>
  );
}

/** Share for everyone; sign-out actions for the owner. */
function MoreMenu({
  owner,
  name,
  onSignOut,
  onSignOutEverywhere,
}: {
  owner: boolean;
  name: string;
  onSignOut: () => void;
  onSignOutEverywhere?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setConfirming(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const share = async () => {
    const url = window.location.href.split("#")[0]!.split("?")[0]!;
    try {
      if (typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("Link copied.");
        window.setTimeout(() => setStatus(null), 2000);
      }
      setOpen(false);
    } catch {
      /* closed the share sheet */
    }
  };

  const everywhere = async () => {
    if (!onSignOutEverywhere) return;
    setBusy(true);
    setError(null);
    try {
      await onSignOutEverywhere();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign out of all devices. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="pp-more" ref={wrap}>
      <button type="button" className="pp-icon-btn" aria-label="More" aria-haspopup="true" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="more" />
      </button>
      <span className="pp-more__status" role="status" aria-live="polite">
        {status ?? ""}
      </span>
      {open ? (
        <div className="pp-more__menu">
          {confirming ? (
            <div className="pp-more__confirm" role="group" aria-label="Sign out of all devices">
              <p>This signs you out on every phone and computer, including this one. Continue?</p>
              <button type="button" className="pp-more__item pp-more__item--danger" disabled={busy} onClick={() => void everywhere()}>
                {busy ? "Signing out…" : "Yes, sign out everywhere"}
              </button>
              <button type="button" className="pp-more__item" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              {error ? (
                <p className="pp-more__error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <button type="button" className="pp-more__item" onClick={() => void share()}>
                Share profile
              </button>
              {owner ? (
                <>
                  <button type="button" className="pp-more__item" onClick={onSignOut}>
                    Sign out
                  </button>
                  {onSignOutEverywhere ? (
                    <button type="button" className="pp-more__item" onClick={() => setConfirming(true)}>
                      Sign out of all devices
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
