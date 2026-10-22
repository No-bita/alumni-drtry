/** Build intent (`/intent/build`): mirrors `CareerPage` shell and hub grid; labels and feed wiring are placeholders. */
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";

function BuildIntentHub({
  onPrimary,
  onSecondary,
  onTertiary,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  onTertiary: () => void;
}) {
  return (
    <section className="career-hub" aria-labelledby="build-hub-title">
      <div className="career-hub__shell">
        <h2 id="build-hub-title" className="visually-hidden">
          Build actions
        </h2>
        <header className="career-hub__intro" />
        <div className="career-hub__grid career-hub__grid--three">
          <button
            type="button"
            className="career-hub__panel career-hub__panel--clickable ds-surface-card career-hub__panel--hire"
            onClick={onPrimary}
          >
            <p className="career-hub__panel-eyebrow">Label one</p>
            <h3 className="career-hub__panel-title">Primary action</h3>
          </button>
          <button
            type="button"
            className="career-hub__panel career-hub__panel--clickable ds-surface-card career-hub__panel--seek"
            onClick={onSecondary}
          >
            <p className="career-hub__panel-eyebrow">Label two</p>
            <h3 className="career-hub__panel-title">Secondary action</h3>
          </button>
          <button
            type="button"
            className="career-hub__panel career-hub__panel--clickable ds-surface-card career-hub__panel--help"
            onClick={onTertiary}
          >
            <p className="career-hub__panel-eyebrow">Label three</p>
            <h3 className="career-hub__panel-title">Tertiary action</h3>
          </button>
        </div>
      </div>
    </section>
  );
}

function navDisplayName(profile: { fullName?: string | null } | undefined, email: string | undefined): string {
  const fn = (profile?.fullName ?? "").trim() || profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

export function BuildPage() {
  const auth = useAuth();

  if (auth.status !== "authenticated") {
    return null;
  }

  const displayName =
    (auth.myProfile?.fullName ?? "").trim() ||
    auth.myProfile?.fullName?.trim() ||
    navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail);

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 id="build-toolbar-title" className="nav-app-toolbar__welcome-title">
              Build
            </h1>
          </div>
        }
      />
      <BuildIntentHub onPrimary={() => {}} onSecondary={() => {}} onTertiary={() => {}} />
      <div className="career-page-intent-feed">
        <section
          className="career-feed-rows ds-surface-card career-page-intent-feed__panel"
          aria-labelledby="build-activity-heading"
        >
          <h2 id="build-activity-heading" className="career-feed-rows__title">
            Activity
          </h2>
          <p className="career-feed-rows__state">Placeholder — feed hooks come next.</p>
        </section>
      </div>
    </div>
  );
}
