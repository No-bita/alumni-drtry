import { Nav } from "../Nav";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import "./OnboardingWelcome.css";

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

  /** The page is dark but <body> is cream; paint the document dark too so no cream band can show. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("onboarding-dark");
    document.body.classList.add("onboarding-dark");
    return () => {
      root.classList.remove("onboarding-dark");
      document.body.classList.remove("onboarding-dark");
    };
  }, []);

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
        className={`onboarding-welcome${showBeginButton ? " onboarding-welcome--intro" : " onboarding-welcome--questions"}`}
        aria-labelledby={showBeginButton ? "onboarding-welcome-heading" : undefined}
        aria-label={showBeginButton ? undefined : "Onboarding questions"}
      >
        <div className="onboarding-welcome__grid">
          {showBeginButton ? (
            <div className="onboarding-welcome__left">
              <p className="onboarding-welcome__eyebrow">Alma Mater · your alumni network</p>
              <p className="onboarding-welcome__quote">
                Everyone who ever called Banaras home is{" "}
                <span className="onboarding-welcome__quote-accent">one message away</span>.
              </p>
              <ul className="onboarding-welcome__perks">
                <li className="onboarding-welcome__perk">
                  Find batchmates and seniors by city, department and batch.
                </li>
                <li className="onboarding-welcome__perk">
                  Ask for intros, referrals and advice, and pass them on when it's your turn.
                </li>
                <li className="onboarding-welcome__perk">
                  Hire, get hired, or find a decent flat in a city you just moved to.
                </li>
              </ul>
              <p className="onboarding-welcome__walked">
                Two minutes now, a lifetime of "bhaiya, ek minute" later.
              </p>
            </div>
          ) : null}
          <div className="onboarding-welcome__right">
            {showBeginButton ? (
              <h1 id="onboarding-welcome-heading" className="onboarding-welcome__headline">
                Welcome to Alma Mater
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
