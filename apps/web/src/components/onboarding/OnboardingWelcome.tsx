import { useId } from "react";
import { Nav } from "../Nav";
import type { MyProfileView } from "../../api/client";
import { cohortLabelFromProfile, firstNameForGreeting } from "../../lib/onboardingDisplay";

/** Marketing-style figures; replace with API-driven stats when available. */
const MARKETING_ALUMNI_TOTAL = 847;
const MARKETING_DEPT_COUNT = "38+";

function GateLineArt() {
  const gid = useId().replace(/:/g, "");
  return (
    <svg
      className="onboarding-welcome__gate-svg"
      viewBox="0 0 420 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={`onb-gate-stroke-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(212, 184, 130, 0.35)" />
          <stop offset="50%" stopColor="rgba(201, 168, 108, 0.85)" />
          <stop offset="100%" stopColor="rgba(212, 184, 130, 0.4)" />
        </linearGradient>
      </defs>
      <path
        fill="none"
        stroke={`url(#onb-gate-stroke-${gid})`}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M36 172 V68 Q210 6 384 68 V172"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.45"
        d="M210 14 V172"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        d="M118 172 V96 M302 172 V96"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.55"
        d="M148 172 V118 M272 172 V118"
      />
    </svg>
  );
}

type OnboardingWelcomeProps = {
  profile: MyProfileView;
  email: string;
  onBegin: () => void;
};

export function OnboardingWelcome({ profile, email, onBegin }: OnboardingWelcomeProps) {
  const firstName = firstNameForGreeting(profile.fullName, email);
  const cohort = cohortLabelFromProfile(profile);

  return (
    <div className="onboarding-welcome-page">
      <Nav
        variant="onboarding"
        hideSignOut
        right={<span className="nav__est-tag">IIT BHU · Est. 1919</span>}
      />
      <section className="onboarding-welcome" aria-labelledby="onboarding-welcome-heading">
        <div className="onboarding-welcome__grid">
          <div className="onboarding-welcome__left">
            <blockquote className="onboarding-welcome__quote">
              Some gates lead somewhere. This one leads to{" "}
              <span className="onboarding-welcome__quote-accent">each other.</span>
            </blockquote>
            <p className="onboarding-welcome__walked">
              {MARKETING_ALUMNI_TOTAL} alumni have walked through.
            </p>
            <div className="onboarding-welcome__illustration">
              <GateLineArt />
            </div>
          </div>

          <div className="onboarding-welcome__right">
            <div className="onboarding-welcome__verified">
              <span className="onboarding-welcome__verified-dot" aria-hidden />
              <span className="onboarding-welcome__verified-label">Verified</span>
              <span className="onboarding-welcome__verified-email">{email}</span>
            </div>

            <p className="onboarding-welcome__eyebrow">First time here</p>

            <h1 id="onboarding-welcome-heading" className="onboarding-welcome__headline">
              <span className="onboarding-welcome__headline-name">{firstName}.</span> We have been waiting for{" "}
              <em className="onboarding-welcome__headline-em">{cohort}.</em>
            </h1>

            <p className="onboarding-welcome__lede">
              It takes under three minutes to set up your profile and join hundreds of IIT BHU alumni. Your
              community is already here.
            </p>

            <button type="button" className="btn btn--onboarding-welcome" onClick={onBegin}>
              Let&apos;s begin
              <span className="onboarding-welcome__cta-arrow" aria-hidden>
                →
              </span>
            </button>

            <p className="onboarding-welcome__hint">No forms. Just a few quick questions.</p>

            <div className="onboarding-welcome__stats" role="presentation">
              <div className="onboarding-welcome__stat">
                <span className="onboarding-welcome__stat-value">{MARKETING_ALUMNI_TOTAL}</span>
                <span className="onboarding-welcome__stat-label">Alumni here</span>
              </div>
              <div className="onboarding-welcome__stat">
                <span className="onboarding-welcome__stat-value onboarding-welcome__stat-value--muted">—</span>
                <span className="onboarding-welcome__stat-label">From {cohort}</span>
              </div>
              <div className="onboarding-welcome__stat">
                <span className="onboarding-welcome__stat-value">{MARKETING_DEPT_COUNT}</span>
                <span className="onboarding-welcome__stat-label">Departments</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
