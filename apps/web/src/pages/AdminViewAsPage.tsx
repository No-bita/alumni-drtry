import { useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { ViewAsCard } from "../components/ViewAsCard";
import { useAuth } from "../contexts/AuthContext";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";

/**
 * /admin/view-as — open a member's account read-only, for testing (the same card is on Analytics).
 * Only for admins the API allowlists (VIEW_AS_ADMIN_EMAILS); everyone else sees nothing here, and the
 * API refuses them regardless.
 */
export function AdminViewAsPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const authed = auth.status === "authenticated";
  const viewAs = authed ? (auth.viewAs ?? null) : null;
  const allowed = authed && Boolean(auth.canViewAs);
  const displayName = authed && !viewAs ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const ended = params.get("ended");

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">View as member</h1>
          </div>
        }
      />
      <main className="aa-page cr-page">
        {!allowed ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : (
          <>
            {viewAs ? null : ended === "expired" ? (
              <p className="cr-done" role="status">
                View-as ended after its time limit. You&apos;re back on your own account.
              </p>
            ) : ended ? (
              <p className="cr-done" role="status">
                You&apos;re back on your own account.
              </p>
            ) : null}
            <ViewAsCard />
          </>
        )}
      </main>
    </div>
  );
}
