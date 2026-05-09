import { Nav } from "../Nav";
import type { ReactNode } from "react";

type OnboardingWelcomeProps = {
  onBegin: () => void;
  showBeginButton?: boolean;
  children?: ReactNode;
};

export function OnboardingWelcome({
  onBegin,
  showBeginButton = true,
  children,
}: OnboardingWelcomeProps) {
  return (
    <div className="onboarding-welcome-page">
      <Nav
        variant="onboarding"
        hideSignOut
        right={<span className="nav__est-tag">Est. 1919</span>}
      />
      <section className="onboarding-welcome" aria-labelledby="onboarding-welcome-heading">
        <div className="onboarding-welcome__grid">
          <div className="onboarding-welcome__right">
            <h1 id="onboarding-welcome-heading" className="onboarding-welcome__headline">
              Welcome to the IIT BHU alumni network
            </h1>

            {showBeginButton ? (
              <button type="button" className="btn btn--onboarding-welcome" onClick={onBegin}>
                Let&apos;s begin
                <span className="onboarding-welcome__cta-arrow" aria-hidden>
                  →
                </span>
              </button>
            ) : null}
            {children ? <div className="onboarding-welcome__inline-flow">{children}</div> : null}

          </div>
        </div>
      </section>
    </div>
  );
}
