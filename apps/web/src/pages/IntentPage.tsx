import { Navigate, useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import { CAREER_INTENT_DEFAULT_PATH } from "../constants/careerTabs";
import { INTENT_LABELS, isIntentSlug } from "../constants/intents";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { LocationPage } from "./LocationPage";

function navAvatarName(
  profile: { fullName?: string | null } | undefined,
  email: string | undefined
): string {
  const fn = (profile?.fullName ?? "").trim() || profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

/**
 * `/intent/location` → location lens; `/intent/build` → build hub (see App.tsx); `/intent/career` → career hub.
 */
export function IntentPage() {
  const { intentSlug } = useParams();
  const auth = useAuth();

  if (!intentSlug || !isIntentSlug(intentSlug)) {
    return <Navigate to="/home" replace />;
  }

  if (auth.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  if (intentSlug === "career") {
    return <Navigate to={CAREER_INTENT_DEFAULT_PATH} replace />;
  }

  if (intentSlug === "location") {
    return <LocationPage />;
  }

  const title = INTENT_LABELS[intentSlug];
  const displayName =
    (auth.myProfile?.fullName ?? "").trim() ||
    auth.myProfile?.fullName?.trim() ||
    navAvatarName(auth.myProfile ?? undefined, auth.person.institutionalEmail);

  return (
    <div className="intent-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <div className="intent-page">
        <header className="intent-page__header">
          <h1 className="intent-page__title">{title}</h1>
          <p className="intent-page__lede body-text" style={{ color: "var(--ink-muted)" }}>
            This area is coming soon. Use the directory from Home to find alumni in the meantime.
          </p>
        </header>
      </div>
    </div>
  );
}
