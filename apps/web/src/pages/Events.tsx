import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import { demoDisplayFullName } from "../lib/demoProfile";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";

function navAvatarName(
  profile: { fullName?: string | null } | undefined,
  email: string | undefined
): string {
  const fullName = demoDisplayFullName(profile?.fullName).trim() || profile?.fullName?.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    return parts[0] ?? fullName;
  }
  return displayFirstNameFromEmail(email);
}

export function EventsPage() {
  const auth = useAuth();

  const displayName =
    auth.status === "authenticated"
      ? demoDisplayFullName(auth.myProfile?.fullName).trim() ||
          auth.myProfile?.fullName?.trim() ||
          navAvatarName(auth.myProfile ?? undefined, auth.person.institutionalEmail)
      : "";

  return (
    <div className="intent-page-shell events-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <main className="events-page dev-hub-coming-soon" aria-labelledby="events-coming-heading">
        <p className="eyebrow">Events</p>
        <h1 id="events-coming-heading" className="events-page__title">
          Coming Soon
        </h1>
        <p className="events-page__lede body-text">
          Alumni events and RSVPs are on the way. Check back shortly.
        </p>
      </main>
    </div>
  );
}

// Full Events UI is archived in `./Events.legacy.tsx` (`EventsPageLegacy`) until launch.
