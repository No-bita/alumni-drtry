import { Nav } from "../Nav";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

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
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!showBeginButton) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (event.repeat) return;
      event.preventDefault();
      onBegin();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBeginButton, onBegin]);

  return (
    <div className="onboarding-welcome-page">
      <Nav
        variant="onboarding"
        hideSignOut
        right={
          <button
            type="button"
            className="nav__onboarding-exit"
            onClick={() => {
              void auth.logout().then(() => {
                navigate("/login", { replace: true });
              });
            }}
          >
            Logout
          </button>
        }
      />
      <section
        className={`onboarding-welcome${showBeginButton ? "" : " onboarding-welcome--questions"}`}
        aria-labelledby={showBeginButton ? "onboarding-welcome-heading" : undefined}
        aria-label={showBeginButton ? undefined : "Onboarding questions"}
      >
        <div className="onboarding-welcome__grid">
          <div className="onboarding-welcome__right">
            {showBeginButton ? (
              <h1 id="onboarding-welcome-heading" className="onboarding-welcome__headline">
                Welcome to the IIT BHU alumni network
              </h1>
            ) : null}

            {showBeginButton ? (
              <div className="onboarding-welcome__start-shell">
                <div className="onboarding-welcome__start-row">
                  <button type="button" className="btn btn--onboarding-welcome" onClick={onBegin}>
                    Start
                  </button>
                  <span className="onboarding-welcome__start-enter" aria-hidden>
                    press Enter ↵
                  </span>
                </div>
                <p className="onboarding-welcome__start-time">Takes 2 minutes</p>
              </div>
            ) : null}
            {children ? <div className="onboarding-welcome__inline-flow">{children}</div> : null}

          </div>
        </div>
      </section>
    </div>
  );
}
