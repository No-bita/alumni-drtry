import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import { demoDisplayFullName } from "../lib/demoProfile";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";

function navDisplayName(profile: { fullName?: string | null } | undefined, email: string | undefined): string {
  const fn = demoDisplayFullName(profile?.fullName).trim() || profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

export function BuildPage() {
  const auth = useAuth();

  if (auth.status !== "authenticated") return null;

  const displayName =
    demoDisplayFullName(auth.myProfile?.fullName).trim() ||
    auth.myProfile?.fullName?.trim() ||
    navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail);

  return (
    <div className="intent-page-shell events-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <main className="events-page dev-hub-coming-soon" aria-labelledby="build-coming-heading">
        <p className="eyebrow">Build</p>
        <h1 id="build-coming-heading" className="events-page__title">
          Coming Soon
        </h1>
        <p className="events-page__lede body-text">
          The alumni build hub is in progress. Check back shortly.
        </p>
      </main>
    </div>
  );
}

// Full Build UI is archived in `./BuildPage.legacy.tsx` (`BuildPageLegacy`) until launch.
