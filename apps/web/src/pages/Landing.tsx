import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { canAccessOnboardingFlow } from "../lib/onboardingEligibility";

/** Legacy route wrapper: unauthenticated users now start at `/login`. */
export function Landing() {
  const auth = useAuth();
  const person = auth.status === "authenticated" ? auth.person : undefined;

  if (auth.status === "loading") {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        <p className="body-text" style={{ color: "var(--ink-muted)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (
    auth.status === "authenticated" &&
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

  if (auth.status === "authenticated" && auth.myProfileError) {
    return <Navigate to="/login" replace />;
  }

  if (auth.status === "authenticated" && auth.myProfile) {
    const profile = auth.myProfile;
    if (profile.onboardingCompletedAt) {
      return <Navigate to="/home" replace />;
    }
    return (
      <Navigate to={canAccessOnboardingFlow(profile, person) ? "/onboarding" : "/home"} replace />
    );
  }

  return <Navigate to="/login" replace />;
}
