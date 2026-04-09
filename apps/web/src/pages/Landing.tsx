import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Eyebrow } from "../components/Eyebrow";
import { API_BASE_URL } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { useAuth } from "../contexts/AuthContext";
import { canAccessOnboardingFlow, superAdminSkipsAlumniJourney } from "../lib/onboardingEligibility";
import { LandingWorldMap } from "../components/LandingWorldMap";

/**
 * Public marketing page at `/`. Signed-in users are redirected to `/home` or `/onboarding`.
 * Profile data comes from `AuthContext` (same `/v1/me` + `/v1/me/profile` load as the rest of the app).
 */
export function Landing() {
  const auth = useAuth();
  const person = auth.status === "authenticated" ? auth.person : undefined;

  const googleConfigQuery = useQuery({
    queryKey: queryKeys.auth.googleConfig(),
    queryFn: ({ signal }) => assertApiGet<{ enabled: boolean }>("/v1/auth/google/config", signal),
    staleTime: 5 * 60_000,
  });
  const googleEnabled = Boolean(googleConfigQuery.data?.enabled);

  if (auth.status === "loading") {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        <p className="body-text" style={{ color: "var(--ink-muted)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (auth.status === "authenticated" && superAdminSkipsAlumniJourney(person)) {
    return <Navigate to="/home" replace />;
  }

  if (
    auth.status === "authenticated" &&
    !superAdminSkipsAlumniJourney(person) &&
    !auth.myProfileError &&
    !auth.myProfile
  ) {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        <p className="body-text" style={{ color: "var(--ink-muted)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (auth.status === "authenticated" && !superAdminSkipsAlumniJourney(person) && auth.myProfileError) {
    return (
      <>
        <Nav />
        <div style={{ padding: "4rem var(--page-x)", textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
          <p className="section-headline" style={{ marginBottom: 12 }}>
            Couldn’t load your profile
          </p>
          <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 24 }}>
            Refresh the page or try signing in again.
          </p>
          <Link to="/login">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      </>
    );
  }

  if (auth.status === "authenticated" && !superAdminSkipsAlumniJourney(person) && auth.myProfile) {
    const profile = auth.myProfile;
    if (profile.onboardingCompletedAt) {
      return <Navigate to="/home" replace />;
    }
    return (
      <Navigate to={canAccessOnboardingFlow(profile, person) ? "/onboarding" : "/home"} replace />
    );
  }

  return (
    <>
      <Nav
        right={
          <Link to="/login" style={{ color: "var(--cream)", fontSize: 13, textDecoration: "none" }}>
            Sign in
          </Link>
        }
      />
      <section className="hero hero--map-serif-voice">
        <div className="hero__left">
          <Eyebrow>IIT BHU Alumni Network</Eyebrow>
          <h1 className="page-headline page-headline--map-serif" style={{ marginBottom: 24 }}>
            You knew them then.
            <br />
            Find them now.
          </h1>
          <div className="landing-signin-ctas">
            <div className="landing-signin-ctas__cell landing-signin-ctas__cell--insti">
              <Link to="/login" style={{ textDecoration: "none", display: "flex", width: "100%" }}>
                <Button variant="primary" style={{ width: "100%", boxSizing: "border-box" }}>
                  Sign in with insti email
                </Button>
              </Link>
            </div>
            {googleEnabled ? (
              <div className="landing-signin-ctas__cell landing-signin-ctas__cell--google">
                <a className="btn btn--secondary" href={`${API_BASE_URL}/v1/auth/google`}>
                  Sign in with Google
                </a>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: "2.5rem" }}>
            <div>
              <span className="stat-number">1000+</span>
              <span className="ui-label" style={{ display: "block", marginTop: 4 }}>
                Alumni
              </span>
            </div>
            <div>
              <span className="stat-number">10+</span>
              <span className="ui-label" style={{ display: "block", marginTop: 4 }}>
                Batches
              </span>
            </div>
          </div>
        </div>
        <LandingWorldMap className="hero__map" />
      </section>
    </>
  );
}
