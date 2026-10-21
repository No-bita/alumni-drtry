import { useEffect, useLayoutEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { queryClient } from "../queryClient";
import { useAuth } from "../contexts/AuthContext";
import { AUTH_SESSION_QUERY_KEY, type AuthSessionData } from "../lib/authSessionQuery";
import {
  FIXTURE_DEMO_PERSON,
  FIXTURE_DEMO_PROFILE,
  activateFixtureDemoSession,
  isFixtureDemoPageEnabled,
} from "../lib/fixtureDemo";

/**
 * Entry to the no-login fixture demo. Activates the tab-scoped fixture session and seeds
 * the auth cache, then navigates to the directory (the first tour stop) only once the
 * auth context actually reads authenticated - cache-notification timing must not race
 * the RequireAuth gate. When the build flag is off, /demo redirects to /login.
 */
export function FixtureDemoEntry() {
  const navigate = useNavigate();
  const auth = useAuth();

  useLayoutEffect(() => {
    if (!isFixtureDemoPageEnabled) return;
    activateFixtureDemoSession();
    /* A signed-in member can arrive with real directory/city/profile data cached. Drop
       every OTHER cached query (and discard in-flight ones) before seeding, so the demo
       only ever renders fixtures. The auth query itself must keep its object identity:
       removing it detaches the AuthProvider observer from later cache writes. */
    const isNotAuthQuery = (query: { queryKey: readonly unknown[] }) =>
      !(query.queryKey[0] === "auth" && query.queryKey[1] === "session");
    void queryClient.cancelQueries({ predicate: isNotAuthQuery });
    queryClient.removeQueries({ predicate: isNotAuthQuery });
    const session: AuthSessionData = {
      kind: "authenticated",
      person: FIXTURE_DEMO_PERSON,
      myProfile: FIXTURE_DEMO_PROFILE,
      myProfileError: false,
    };
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
  }, []);

  useEffect(() => {
    if (isFixtureDemoPageEnabled && auth.status === "authenticated") {
      navigate("/search", { replace: true });
    }
  }, [auth.status, navigate]);

  if (!isFixtureDemoPageEnabled) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ padding: "4rem var(--page-x)", textAlign: "center" }}
    >
      <p className="body-text" style={{ color: "var(--ink-muted)" }}>
        Loading…
      </p>
    </div>
  );
}
